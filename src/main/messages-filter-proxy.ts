import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "accept-encoding",
]);

interface StreamState {
  dropped: Set<number>;
  indexMap: Map<number, number>;
  nextIndex: number;
}

function remapIndex(state: StreamState, index: number): number {
  const existing = state.indexMap.get(index);
  if (existing !== undefined) return existing;
  const mapped = state.nextIndex++;
  state.indexMap.set(index, mapped);
  return mapped;
}

export function filterAnthropicPayload(
  payload: unknown,
  state: StreamState,
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

export function filterSseFrame(frame: string, state: StreamState): string | null {
  const lines = frame.split(/\r?\n/);
  const data: string[] = [];
  const other: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    else other.push(line);
  }
  if (!data.length || data.join("\n") === "[DONE]") return frame;
  try {
    const filtered = filterAnthropicPayload(JSON.parse(data.join("\n")), state);
    if (filtered === null) return null;
    return [...other, `data: ${JSON.stringify(filtered)}`].join("\n");
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
    // Preserve malformed/non-JSON upstream bodies unchanged.
  }
  return body;
}

export class MessagesFilterProxy {
  private server?: http.Server;
  private upstreamBase = "";

  constructor(
    readonly host = "127.0.0.1",
    readonly port = 8787,
  ) {}

  get running(): boolean {
    return Boolean(this.server?.listening);
  }

  async start(upstreamBase: string): Promise<void> {
    const normalized = upstreamBase.replace(/\/+$/, "");
    if (this.running && this.upstreamBase === normalized) return;
    if (this.running) await this.stop();
    this.upstreamBase = normalized;
    const server = http.createServer((request, response) => this.forward(request, response));
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
      response.end(JSON.stringify({ ok: true, upstreamBase: this.upstreamBase }));
      return;
    }
    const incoming = new URL(request.url ?? "/", `http://${this.host}:${this.port}`);
    const upstreamPath = incoming.pathname.replace(/^\/v1(?=\/|$)/, "") || "/";
    const target = new URL(`${this.upstreamBase}${upstreamPath}${incoming.search}`);
    const transport = target.protocol === "https:" ? https : http;
    const headers = Object.fromEntries(
      Object.entries(request.headers).filter(([key]) => !HOP_BY_HOP.has(key.toLowerCase())),
    );
    const upstream = transport.request(
      target,
      { method: request.method, headers },
      (upstreamResponse) => this.pipeResponse(incoming.pathname, upstreamResponse, response),
    );
    upstream.setTimeout(300_000, () => upstream.destroy(new Error("上游请求超时")));
    upstream.on("error", (error) => {
      if (response.headersSent) return response.destroy(error);
      response.writeHead(502, { "content-type": "application/json", connection: "close" });
      response.end(JSON.stringify({ error: "proxy_error", message: error.message }));
    });
    request.pipe(upstream);
  }

  private pipeResponse(
    pathname: string,
    upstream: IncomingMessage,
    response: ServerResponse,
  ): void {
    const isMessages = pathname === "/v1/messages";
    const isSse = String(upstream.headers["content-type"] ?? "")
      .toLowerCase()
      .includes("text/event-stream");
    const headers = Object.fromEntries(
      Object.entries(upstream.headers).filter(([key]) => !HOP_BY_HOP.has(key.toLowerCase())),
    );
    if (isMessages) delete headers["content-length"];
    response.writeHead(upstream.statusCode ?? 502, { ...headers, connection: "close" });
    if (!isMessages) return void upstream.pipe(response);
    if (!isSse) {
      const chunks: Buffer[] = [];
      upstream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      upstream.on("end", () => response.end(removeThinkingBlocks(Buffer.concat(chunks))));
      return;
    }

    const state: StreamState = { dropped: new Set(), indexMap: new Map(), nextIndex: 0 };
    let pending = "";
    upstream.setEncoding("utf8");
    upstream.on("data", (chunk: string) => {
      pending += chunk.replaceAll("\r\n", "\n");
      let boundary = pending.indexOf("\n\n");
      while (boundary >= 0) {
        const frame = pending.slice(0, boundary);
        pending = pending.slice(boundary + 2);
        const filtered = filterSseFrame(frame, state);
        if (filtered !== null) response.write(`${filtered}\n\n`);
        boundary = pending.indexOf("\n\n");
      }
    });
    upstream.on("end", () => {
      if (pending) {
        const filtered = filterSseFrame(pending, state);
        if (filtered !== null) response.write(`${filtered}\n\n`);
      }
      response.end();
    });
  }
}

