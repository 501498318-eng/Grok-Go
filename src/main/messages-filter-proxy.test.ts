import { describe, expect, it } from "vitest";
import {
  filterSseFrame,
  removeThinkingBlocks,
} from "./messages-filter-proxy.js";

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
});
