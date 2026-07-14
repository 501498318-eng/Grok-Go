import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  ApiCompatibilityProxy,
  filterSseFrame,
  removeThinkingBlocks,
  responsesSyntheticPreludeRule,
  anthropicThinkingRule,
  type AnthropicStreamState,
} from "./api-compatibility-proxy.js";

const cleanup: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.allSettled(cleanup.splice(0).map((close) => close()));
});

async function listen(
  handler: http.RequestListener,
): Promise<{ baseUrl: string; server: http.Server }> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试服务器端口不可用");
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { baseUrl: `http://127.0.0.1:${address.port}`, server };
}

async function availablePort(): Promise<number> {
  const { server } = await listen((_request, response) => response.end());
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("测试端口不可用");
  const port = address.port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  cleanup.pop();
  return port;
}

function anthropicState(): AnthropicStreamState {
  return { dropped: new Set(), indexMap: new Map(), nextIndex: 0 };
}

describe("API compatibility proxy rules", () => {
  it("drops Anthropic thinking events and remaps later tool indexes", () => {
    const state = anthropicState();
    const thinking = filterSseFrame(
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
      anthropicThinkingRule,
      state,
    );
    const tool = filterSseFrame(
      'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"list_dir","input":{}}}',
      anthropicThinkingRule,
      state,
    );
    const delta = filterSseFrame(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}',
      anthropicThinkingRule,
      state,
    );
    expect(thinking).toBeNull();
    expect(tool).toContain('"index":0');
    expect(tool).toContain('"name":"list_dir"');
    expect(delta).toContain('"index":0');
    expect(delta).toContain("input_json_delta");
  });

  it("removes thinking blocks from non-streaming Anthropic responses", () => {
    const output = JSON.parse(
      removeThinkingBlocks(
        Buffer.from(JSON.stringify({ content: [
          { type: "thinking", thinking: "hidden" },
          { type: "tool_use", id: "tool-1", name: "list_dir", input: {} },
        ] })),
      ).toString("utf8"),
    );
    expect(output.content).toEqual([
      { type: "tool_use", id: "tool-1", name: "list_dir", input: {} },
    ]);
  });

  it("drops only the exact Responses synthetic empty prelude", () => {
    const invalid =
      'data: {"type":"response.output_text.delta","item_id":"synthetic-first-token","output_index":0,"content_index":0,"delta":"","synthetic_first_token":true}';
    expect(
      filterSseFrame(invalid, responsesSyntheticPreludeRule, undefined),
    ).toBeNull();

    const variants = [
      'data: {"type":"response.output_text.delta","delta":"x","synthetic_first_token":true}',
      'data: {"type":"response.output_text.delta","delta":"","synthetic_first_token":false}',
      'data: {"type":"response.output_text.delta","delta":"","synthetic_first_token":true,"sequence_number":0}',
      'data: {"type":"response.function_call_arguments.delta","delta":"","synthetic_first_token":true}',
    ];
    for (const frame of variants) {
      expect(filterSseFrame(frame, responsesSyntheticPreludeRule, undefined)).toBe(frame);
    }
  });

  it("preserves compliant Responses and function-call frames exactly", () => {
    const frames = [
      'event: response.created\ndata: {"type":"response.created","sequence_number":0,"response":{"id":"resp-1"}}',
      'event: response.function_call_arguments.delta\ndata: {"type":"response.function_call_arguments.delta","sequence_number":7,"item_id":"call-1","output_index":0,"delta":"{}"}',
      'event: response.function_call_arguments.done\ndata: {"type":"response.function_call_arguments.done","sequence_number":8,"item_id":"call-1","output_index":0,"arguments":"{}"}',
      ': keep-alive',
      'data: [DONE]',
      'data: not-json',
    ];
    for (const frame of frames) {
      expect(filterSseFrame(frame, responsesSyntheticPreludeRule, undefined)).toBe(frame);
    }
  });

  it("passes the original frame through when a rule throws", () => {
    const frame = 'data: {"type":"response.created","sequence_number":0}';
    expect(
      filterSseFrame(
        frame,
        { id: "test-throw", transform: () => { throw new Error("broken rule"); } },
        undefined,
      ),
    ).toBe(frame);
  });
});

describe("API compatibility proxy integration", () => {
  it("filters a chunked CRLF Responses stream and preserves tool events", async () => {
    const upstream = await listen((request, response) => {
      expect(request.url).toBe("/v1/responses");
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"","synthetic_first_token":true}\r\n');
      response.write('\r\nevent: response.created\r\ndata: {"type":"response.created","sequence_number":0}\r\n\r\n');
      response.end('event: response.function_call_arguments.done\r\ndata: {"type":"response.function_call_arguments.done","sequence_number":1,"item_id":"call-1","arguments":"{}"}\r\n\r\n');
    });
    const port = await availablePort();
    const proxy = new ApiCompatibilityProxy("127.0.0.1", port);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`, "openai-responses");

    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      method: "POST",
      body: "{}",
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("synthetic_first_token");
    expect(body).toContain('"sequence_number":0');
    expect(body).toContain("response.function_call_arguments.done");
    expect(body).toContain('"sequence_number":1');
  });

  it("filters a real Anthropic SSE response and preserves tool events", async () => {
    const upstream = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n');
      response.write('event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"list_dir","input":{}}}\n\n');
      response.end('event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n');
    });
    const port = await availablePort();
    const proxy = new ApiCompatibilityProxy("127.0.0.1", port);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`, "anthropic");

    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: "POST",
      body: "{}",
    });
    const body = await response.text();

    expect(body).not.toContain('"type":"thinking"');
    expect(body).toContain('"name":"list_dir"');
    expect(body).toContain('"index":0');
  });

  it("passes non-streaming Responses bodies through unchanged", async () => {
    const payload = JSON.stringify({
      id: "resp-1",
      output: [{ type: "function_call", name: "diagnostic_ping", arguments: "{}" }],
    });
    const upstream = await listen((_request, response) => {
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
      });
      response.end(payload);
    });
    const port = await availablePort();
    const proxy = new ApiCompatibilityProxy("127.0.0.1", port);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`, "openai-responses");

    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      method: "POST",
      body: "{}",
    });
    expect(await response.text()).toBe(payload);
    expect(response.headers.get("content-length")).toBe(String(Buffer.byteLength(payload)));
  });

  it("leaves Chat Completions traffic unmodified", async () => {
    const frame = 'data: {"type":"response.output_text.delta","delta":"","synthetic_first_token":true}\n\n';
    const upstream = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(frame);
    });
    const port = await availablePort();
    const proxy = new ApiCompatibilityProxy("127.0.0.1", port);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`, "openai-chat");

    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`);
    expect(await response.text()).toBe(frame);
  });

  it("reports the active protocol and rule without exposing credentials", async () => {
    const port = await availablePort();
    const proxy = new ApiCompatibilityProxy("127.0.0.1", port);
    cleanup.push(() => proxy.stop());
    await proxy.start("https://provider.example/v1", "openai-responses");

    const response = await fetch(
      `http://127.0.0.1:${port}/_grok-switcher/health`,
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      protocol: "openai-responses",
      activeRule: "responses-synthetic-empty-prelude",
    });
  });

  it("rejects startup when the proxy port is already occupied", async () => {
    const occupied = await listen((_request, response) => response.end());
    const address = occupied.server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");

    const proxy = new ApiCompatibilityProxy("127.0.0.1", address.port);
    await expect(
      proxy.start("https://provider.example/v1", "openai-responses"),
    ).rejects.toMatchObject({ code: "EADDRINUSE" });
  });

  it("returns 502 when the upstream request times out", async () => {
    const upstream = await listen(() => undefined);
    const port = await availablePort();
    const proxy = new ApiCompatibilityProxy("127.0.0.1", port, 30);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`, "openai-responses");

    const response = await fetch(`http://127.0.0.1:${port}/v1/responses`, {
      method: "POST",
      body: "{}",
    });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      error: "proxy_error",
      message: "上游请求超时",
    });
  });

  it("closes the downstream response when the upstream disconnects", async () => {
    const upstream = await listen((_request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.flushHeaders();
      response.write('event: response.created\ndata: {"type":"response.created","sequence_number":0}\n\n');
      setTimeout(() => response.socket?.destroy(), 10);
    });
    const port = await availablePort();
    const proxy = new ApiCompatibilityProxy("127.0.0.1", port, 200);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`, "openai-responses");

    const outcome = await Promise.race([
      fetch(`http://127.0.0.1:${port}/v1/responses`, { method: "POST", body: "{}" })
        .then(async (response) => ({ kind: "body" as const, body: await response.text() }))
        .catch((error: unknown) => ({ kind: "error" as const, error })),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("下游响应未关闭")), 500),
      ),
    ]);
    if (outcome.kind === "body") {
      expect(outcome.body).toContain("response.created");
    } else {
      expect(outcome.error).toBeInstanceOf(Error);
    }
  });
});
