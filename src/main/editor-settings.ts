import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { applyEdits, modify, parse } from "jsonc-parser";
import writeFileAtomic from "write-file-atomic";

const EDITOR_USER_DIRS = ["Code", "Cursor", "Windsurf"];

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export interface EditorSettingsSyncResult {
  updated: string[];
  failed: string[];
}

export async function syncEditorDefaultModel(
  defaultModel: string,
  appDataPath = process.env.APPDATA,
): Promise<EditorSettingsSyncResult> {
  const result: EditorSettingsSyncResult = { updated: [], failed: [] };
  if (!appDataPath) return result;

  for (const editor of EDITOR_USER_DIRS) {
    const settingsPath = path.join(appDataPath, editor, "User", "settings.json");
    if (!(await exists(settingsPath))) continue;

    try {
      const currentText = await readFile(settingsPath, "utf8");
      const settings = parse(currentText) as Record<string, unknown> | undefined;
      if (!settings || !("grok.defaultModel" in settings)) continue;
      if (settings["grok.defaultModel"] === defaultModel) continue;

      const edits = modify(currentText, ["grok.defaultModel"], defaultModel, {
        formattingOptions: { insertSpaces: true, tabSize: 4 },
      });
      await writeFileAtomic(settingsPath, applyEdits(currentText, edits), {
        encoding: "utf8",
      });
      result.updated.push(editor);
    } catch {
      result.failed.push(editor);
    }
  }

  return result;
}
