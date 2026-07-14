import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import type { ApiProtocol } from "../shared/types.js";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const REQUEST_ONLY_HEADERS = new Set(["host", "content-length", "accept-encoding"]);

export const ANTHROPIC_THINKING_RULE_ID = "anthropic-thinking-blocks";
export const RESPONSES_SYNTHETIC_PRELUDE_RULE_ID =
  "responses-synthetic-empty-prelude";

export interface AnthropicStreamState {
  dropped: Set<number>;
  indexMap: Map<number, number>;
  nextIndex: number;
}

export interface SseCompatibilityRule<State> {
  readonly id: string;
  transform(payload: unknown, state: State): unknown | null;
}

function remapIndex(state: AnthropicStreamState, index: number): number {
  const existing = state.indexMap.get(index);
  if (existing !== undefined) return existing;
  const mapped = state.nextIndex++;
  state.indexMap.set(index, mapped);
  return mapped;
}

export function filterAnthropicPayload(
  payload: unknown,
  state: AnthropicStreamState,
): unknown | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  const type = record.type;
  if (type === "content_block_start") {
    const index = typeof record.index === "number" ? record.index : undefined;
    const block = record.content_block;
    if (
      index !== undefined &&
      block &&
      typeof block === "object" &&
      !Array.isArray(block) &&
      (block as Record<string, unknown>).type === "thinking"
    ) {
      state.dropped.add(index);
      return null;
    }
    if (index !== undefined) record.index = remapIndex(state, index);
    return record;
  }
  if (type === "content_block_delta" || type === "content_block_stop") {
    const index = typeof record.index === "number" ? record.index : undefined;
    if (index !== undefined && state.dropped.has(index)) return null;
    if (index !== undefined) record.index = remapIndex(state, index);
  }
  return record;
}

export function filterResponsesPayload(payload: unknown): unknown | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const record = payload as Record<string, unknown>;
  if (
    record.type === "response.output_text.delta" &&
    record.synthetic_first_token === true &&
    record.delta === "" &&
    !("sequence_number" in record)
  ) {
    return null;
  }
  return record;
}

export const anthropicThinkingRule: SseCompatibilityRule<AnthropicStreamState> = {
  id: ANTHROPIC_THINKING_RULE_ID,
  transform: filterAnthropicPayload,
};

export const responsesSyntheticPreludeRule: SseCompatibilityRule<undefined> = {
  id: RESPONSES_SYNTHETIC_PRELUDE_RULE_ID,
  transform: filterResponsesPayload,
};

export function filterSseFrame<State>(
  frame: string,
  rule: SseCompatibilityRule<State>,
  state: State,
): string | null {
  const lines = frame.split(/\r?\n/);
  const dataIndexes: number[] = [];
  const data: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (!line.startsWith("data:")) continue;
    dataIndexes.push(index);
    data.push(line.slice(5).replace(/^ /, ""));
  }
  const serialized = data.join("\n");
  if (!data.length || serialized === "[DONE]") return frame;
  try {
    const payload = JSON.parse(serialized) as unknown;
    const before = JSON.stringify(payload);
    const filtered = rule.transform(payload, state);
    if (filtered === null) return null;
    const after = JSON.stringify(filtered);
    if (after === before) return frame;

    const firstDataIndex = dataIndexes[0];
    const dataIndexSet = new Set(dataIndexes);
    return lines
      .flatMap((line, index) => {
        if (index === firstDataIndex) return [`data: ${after}`];
        return dataIndexSet.has(index) ? [] : [line];
      })
      .join("\n");
  } catch {
    return frame;
  }
}

export function removeThinkingBlocks(body: Buffer): Buffer {
  try {
    const payload = JSON.parse(body.toString("utf8")) as Record<string, unknown>;
    if (Array.isArray(payload.content)) {
      payload.content = payload.content.filter(
        (item) =>
          !(
            item &&
            typeof item === "object" &&
            !Array.isArray(item) &&
            (item as Record<string, unknown>).type === "thinking"
          ),
      );
      return Buffer.from(JSON.stringify(payload));
    }
  } catch {
    // Preserve malformed and non-JSON upstream bodies unchanged.
  }
  return body;
}

function isFilteredPath(protocol: ApiProtocol, pathname: string): boolean {
  return (
    (protocol === "anthropic" && pathname === "/v1/messages") ||
    (protocol === "openai-responses" && pathname === "/v1/responses")
  );
}

export class ApiCompatibilityProxy {
  private server?: http.Server;
  private upstreamBase = "";
  private protocol: ApiProtocol = "openai-responses";

  constructor(
    readonly host = "127.0.0.1",
    readonly port = 8787,
    private readonly upstreamTimeoutMs = 300_000,
  ) {}

  get running(): boolean {
    return Boolean(this.server?.listening);
  }

  async start(upstreamBase: string, protocol: ApiProtocol): Promise<void> {
    const normalized = upstreamBase.replace(/\/+$/, "");
    if (
      this.running &&
      this.upstreamBase === normalized &&
      this.protocol === protocol
    ) {
      return;
    }
    if (this.running) await this.stop();
    this.upstreamBase = normalized;
    this.protocol = protocol;
    const server = http.createServer((request, response) =>
      this.forward(request, response),
    );
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.port, this.host, () => {
        server.off("error", reject);
        resolve();
      });
    });
    this.server = server;
  }

  async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    if (!server?.listening) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private forward(request: IncomingMessage, response: ServerResponse): void {
    if (request.url === "/_grok-switcher/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          ok: true,
          upstreamBase: this.upstreamBase,
          protocol: this.protocol,
          activeRule:
            this.protocol === "anthropic"
              ? ANTHROPIC_THINKING_RULE_ID
              : this.protocol === "openai-responses"
                ? RESPONSES_SYNTHETIC_PRELUDE_RULE_ID
                : null,
        }),
      );
      return;
    }
    const incoming = new URL(
      request.url ?? "/",
      `http://${this.host}:${this.port}`,
    );
    const upstreamPath = incoming.pathname.replace(/^\/v1(?=\/|$)/, "") || "/";
    const target = new URL(`${this.upstreamBase}${upstreamPath}${incoming.search}`);
    const transport = target.protocol === "https:" ? https : http;
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(
        ([key]) => {
          const normalized = key.toLowerCase();
          return !HOP_BY_HOP.has(normalized) && !REQUEST_ONLY_HEADERS.has(normalized);
        },
      ),
    );
    const upstream = transport.request(
      target,
      { method: request.method, headers },
      (upstreamResponse) =>
        this.pipeResponse(incoming.pathname, upstreamResponse, response),
    );
    upstream.setTimeout(this.upstreamTimeoutMs, () =>
      upstream.destroy(new Error("上游请求超时")),
    );
    upstream.on("error", (error) => {
      if (response.headersSent) return response.destroy(error);
      response.writeHead(502, {
        "content-type": "application/json",
        connection: "close",
      });
      response.end(
        JSON.stringify({ error: "proxy_error", message: error.message }),
      );
    });
    request.pipe(upstream);
  }

  private pipeResponse(
    pathname: string,
    upstream: IncomingMessage,
    response: ServerResponse,
  ): void {
    const filteredPath = isFilteredPath(this.protocol, pathname);
    const isSse = String(upstream.headers["content-type"] ?? "")
      .toLowerCase()
      .includes("text/event-stream");
    const headers = Object.fromEntries(
      Object.entries(upstream.headers).filter(
        ([key]) => !HOP_BY_HOP.has(key.toLowerCase()),
      ),
    );
    const abortDownstream = () => {
      if (!response.destroyed) response.destroy(new Error("上游响应中断"));
    };
    upstream.on("aborted", abortDownstream);
    upstream.on("error", abortDownstream);

    const filtersNonStreaming =
      filteredPath && this.protocol === "anthropic" && !isSse;
    if ((filteredPath && isSse) || filtersNonStreaming) {
      delete headers["content-length"];
    }
    response.writeHead(upstream.statusCode ?? 502, {
      ...headers,
      connection: "close",
    });
    if (!filteredPath) return void upstream.pipe(response);
    if (!isSse) {
      if (this.protocol !== "anthropic") return void upstream.pipe(response);
      const chunks: Buffer[] = [];
      upstream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      upstream.on("end", () =>
        response.end(removeThinkingBlocks(Buffer.concat(chunks))),
      );
      return;
    }

    const anthropicState: AnthropicStreamState = {
      dropped: new Set(),
      indexMap: new Map(),
      nextIndex: 0,
    };
    let pending = "";
    upstream.setEncoding("utf8");
    const filterFrame = (frame: string): string | null =>
      this.protocol === "anthropic"
        ? filterSseFrame(frame, anthropicThinkingRule, anthropicState)
        : filterSseFrame(frame, responsesSyntheticPreludeRule, undefined);
    upstream.on("data", (chunk: string) => {
      pending += chunk.replaceAll("\r\n", "\n");
      let boundary = pending.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const filtered = filterFrame(frame);
        if (filtered !== null) response.write(`${filtered}\n\n`);
        boundary = pending.indexOf("\n\n");
      }
    });
    upstream.on("end", () => {
      if (pending) {
        const filtered = filterFrame(pending);
        if (filtered !== null) response.write(`${filtered}\n\n`);
      }
      response.end();
    });
  }
}
