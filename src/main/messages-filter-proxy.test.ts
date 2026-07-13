import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  filterSseFrame,
  MessagesFilterProxy,
  removeThinkingBlocks,
} from "./messages-filter-proxy.js";

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

function state() {
  return { dropped: new Set<number>(), indexMap: new Map<number, number>(), nextIndex: 0 };
}

describe("messages filter proxy", () => {
  it("drops thinking events and remaps later tool indexes", () => {
    const stream = state();
    const thinking = filterSseFrame(
      'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
      stream,
    );
    const tool = filterSseFrame(
      'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"list_dir","input":{}}}',
      stream,
    );
    const delta = filterSseFrame(
      'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{}"}}',
      stream,
    );
    expect(thinking).toBeNull();
    expect(tool).toContain('"index":0');
    expect(tool).toContain('"name":"list_dir"');
    expect(delta).toContain('"index":0');
    expect(delta).toContain("input_json_delta");
  });

  it("removes thinking blocks from non-streaming messages", () => {
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

  it("filters a real SSE response and preserves tool events", async () => {
    const upstream = await listen((request, response) => {
      expect(request.url).toBe("/v1/messages");
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write('event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n');
      response.write('event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool-1","name":"list_dir","input":{}}}\n\n');
      response.end('event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n');
    });
    const port = await availablePort();
    const proxy = new MessagesFilterProxy("127.0.0.1", port);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`);

    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
      method: "POST",
      body: "{}",
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain('"type":"thinking"');
    expect(body).toContain('"name":"list_dir"');
    expect(body).toContain('"index":0');
  });

  it("rejects startup when the proxy port is already occupied", async () => {
    const occupied = await listen((_request, response) => response.end());
    const address = occupied.server.address();
    if (!address || typeof address === "string") throw new Error("测试端口不可用");

    const proxy = new MessagesFilterProxy("127.0.0.1", address.port);
    await expect(proxy.start("https://provider.example/v1")).rejects.toMatchObject({
      code: "EADDRINUSE",
    });
  });

  it("returns 502 when the upstream request times out", async () => {
    const upstream = await listen(() => undefined);
    const port = await availablePort();
    const proxy = new MessagesFilterProxy("127.0.0.1", port, 30);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`);

    const response = await fetch(`http://127.0.0.1:${port}/v1/messages`, {
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
      response.write('event: message_start\ndata: {"type":"message_start"}\n\n');
      setTimeout(() => response.socket?.destroy(), 10);
    });
    const port = await availablePort();
    const proxy = new MessagesFilterProxy("127.0.0.1", port, 200);
    cleanup.push(() => proxy.stop());
    await proxy.start(`${upstream.baseUrl}/v1`);

    const body = await Promise.race([
      fetch(`http://127.0.0.1:${port}/v1/messages`, { method: "POST", body: "{}" })
        .then((response) => response.text()),
      new Promise<never>((_resolve, reject) =>
        setTimeout(() => reject(new Error("下游响应未关闭")), 500),
      ),
    ]);
    expect(body).toContain("message_start");
  });
});
