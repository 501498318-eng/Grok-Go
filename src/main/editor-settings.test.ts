import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "jsonc-parser";
import { syncEditorDefaultModel } from "./editor-settings.js";

describe("editor settings", () => {
  it("updates existing Grok defaults and preserves JSONC comments", async () => {
    const appData = await mkdtemp(path.join(os.tmpdir(), "grok-editor-settings-"));
    const codeUser = path.join(appData, "Code", "User");
    await mkdir(codeUser, { recursive: true });
    const settingsPath = path.join(codeUser, "settings.json");
    await writeFile(
      settingsPath,
      `{// keep this comment\n    "grok.defaultModel": "grok-old",\n    "editor.fontSize": 16,\n}\n`,
    );

    const result = await syncEditorDefaultModel("grok-4.5", appData);
    const updatedText = await readFile(settingsPath, "utf8");
    const updated = parse(updatedText) as Record<string, unknown>;

    expect(result).toEqual({ updated: ["Code"], failed: [] });
    expect(updated["grok.defaultModel"]).toBe("grok-4.5");
    expect(updated["editor.fontSize"]).toBe(16);
    expect(updatedText).toContain("// keep this comment");
  });

  it("does not add Grok settings to unrelated editors", async () => {
    const appData = await mkdtemp(path.join(os.tmpdir(), "grok-editor-settings-"));
    const cursorUser = path.join(appData, "Cursor", "User");
    await mkdir(cursorUser, { recursive: true });
    const settingsPath = path.join(cursorUser, "settings.json");
    await writeFile(settingsPath, `{ "editor.fontSize": 14 }\n`);

    const result = await syncEditorDefaultModel("grok-4.5", appData);

    expect(result).toEqual({ updated: [], failed: [] });
    expect(await readFile(settingsPath, "utf8")).toBe(`{ "editor.fontSize": 14 }\n`);
  });
});
