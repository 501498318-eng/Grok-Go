import { randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import writeFileAtomic from "write-file-atomic";
import type {
  AppSnapshot,
  ApplyOptions,
  ApplyResult,
  ImportResult,
  ProfileStore,
  ProviderProfile,
  ValidationResult,
} from "../shared/types.js";
import {
  extractProfile,
  hashText,
  mergeProfile,
  normalizeProfile,
  parseConfig,
  profileMatchesConfig,
  validateProfileShape,
} from "./config-core.js";
import { syncEditorDefaultModel } from "./editor-settings.js";
import { ApiCompatibilityProxy } from "./api-compatibility-proxy.js";

const EMPTY_STORE = (configPath: string): ProfileStore => ({
  schemaVersion: 1,
  configPath,
  profiles: [],
});

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

// 单次系统调用同时得到"是否存在"与内容，替代 exists() + readFile() 的两次调用。
async function readFileIfExists(
  filePath: string,
): Promise<{ exists: boolean; text: string }> {
  try {
    return { exists: true, text: await readFile(filePath, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { exists: false, text: "" };
    }
    throw error;
  }
}

function duplicateName(name: string, profiles: ProviderProfile[]): string {
  const names = new Set(profiles.map((profile) => profile.name));
  if (!names.has(name)) return name;
  let suffix = 1;
  while (names.has(`${name} 副本${suffix === 1 ? "" : ` ${suffix}`}`)) suffix += 1;
  return `${name} 副本${suffix === 1 ? "" : ` ${suffix}`}`;
}

export class ProfileService {
  readonly storePath: string;

  constructor(
    private readonly userDataPath: string,
    private readonly defaultConfigPath: string,
    private readonly editorAppDataPath = process.env.APPDATA,
    private readonly compatibilityProxy?: ApiCompatibilityProxy,
  ) {
    this.storePath = path.join(userDataPath, "profiles.json");
  }

  private async readStore(): Promise<ProfileStore> {
    await mkdir(this.userDataPath, { recursive: true });
    if (!(await exists(this.storePath))) {
      const store = EMPTY_STORE(this.defaultConfigPath);
      if (await exists(store.configPath)) {
        const profile = extractProfile(await readFile(store.configPath, "utf8"));
        if (profile) {
          store.profiles.push(profile);
          store.activeProfileId = profile.id;
        }
      }
      if (store.profiles.length === 0) {
        store.profiles.push({
          id: randomUUID(),
          name: "新供应商",
          baseUrl: "https://",
          apiKey: "",
          protocol: "openai-responses",
          compatibilityProxy: false,
          defaultModel: "",
          configuredModels: [],
          modelSettings: {},
        });
      }
      await this.writeStore(store);
      return store;
    }
    const parsed = JSON.parse(await readFile(this.storePath, "utf8")) as ProfileStore;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.profiles)) {
      throw new Error("档案文件版本不受支持");
    }
    const normalized = {
      ...parsed,
      profiles: parsed.profiles.map((profile) => normalizeProfile(profile)),
    };
    if (JSON.stringify(normalized) !== JSON.stringify(parsed)) {
      await this.writeStore(normalized);
    }
    return normalized;
  }

  private async writeStore(store: ProfileStore): Promise<void> {
    await mkdir(path.dirname(this.storePath), { recursive: true });
    await writeFileAtomic(this.storePath, `${JSON.stringify(store, null, 2)}\n`, {
      encoding: "utf8",
    });
  }

  async snapshot(preloaded?: ProfileStore): Promise<AppSnapshot> {
    const store = preloaded ?? (await this.readStore());
    const [config, backupExists] = await Promise.all([
      readFileIfExists(store.configPath),
      exists(`${store.configPath}.bak`),
    ]);
    const active = store.profiles.find(
      (profile) => profile.id === store.activeProfileId,
    );
    return {
      ...store,
      configExists: config.exists,
      backupExists,
      configText: config.text,
      configHash: config.exists ? hashText(config.text) : undefined,
      activeMatchesConfig: profileMatchesConfig(config.text, active),
    };
  }

  async saveProfile(profile: ProviderProfile): Promise<AppSnapshot> {
    const errors = validateProfileShape(profile);
    if (errors.length) throw new Error(errors.join("\n"));
    const store = await this.readStore();
    const normalized = normalizeProfile({ ...profile, id: profile.id || randomUUID() });
    const index = store.profiles.findIndex((item) => item.id === normalized.id);
    if (index >= 0) store.profiles[index] = normalized;
    else store.profiles.push(normalized);
    await this.writeStore(store);
    return this.snapshot(store);
  }

  async deleteProfile(profileId: string): Promise<AppSnapshot> {
    const store = await this.readStore();
    if (store.profiles.length <= 1) throw new Error("至少需要保留一个供应商档案");
    store.profiles = store.profiles.filter((profile) => profile.id !== profileId);
    if (store.activeProfileId === profileId) store.activeProfileId = undefined;
    await this.writeStore(store);
    return this.snapshot(store);
  }

  async setConfigPath(configPath: string): Promise<AppSnapshot> {
    const store = await this.readStore();
    store.configPath = configPath;
    await this.writeStore(store);
    return this.snapshot(store);
  }

  async validate(profile: ProviderProfile): Promise<ValidationResult> {
    const errors = validateProfileShape(profile);
    if (errors.length) throw new Error(errors.join("\n"));
    const started = performance.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    const normalized = normalizeProfile(profile);
    const url = `${normalized.baseUrl.replace(/\/+$/, "")}/models`;
    const headers: Record<string, string> = normalized.protocol === "anthropic"
      ? {
          "x-api-key": normalized.apiKey,
          "anthropic-version": "2023-06-01",
        }
      : { Authorization: `Bearer ${normalized.apiKey}` };
    try {
      const response = await fetch(url, {
        headers,
        signal: controller.signal,
      });
      const elapsedMs = Math.round(performance.now() - started);
      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          elapsedMs,
          models: [],
          message: normalized.protocol === "anthropic" && response.status === 404
            ? "供应商未提供 Anthropic 模型列表接口，可手动添加模型后强制应用"
            : `连接失败（HTTP ${response.status}）`,
        };
      }
      const payload = (await response.json()) as { data?: Array<{ id?: unknown }> };
      const models = Array.isArray(payload.data)
        ? payload.data
            .map((item) => (typeof item.id === "string" ? item.id : ""))
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b))
        : [];
      if (!models.length) {
        return {
          ok: false,
          status: response.status,
          elapsedMs,
          models: [],
          message: "接口可访问，但未返回可用模型",
        };
      }
      return {
        ok: true,
        status: response.status,
        elapsedMs,
        models,
        message: `模型列表读取成功，发现 ${models.length} 个模型（不代表推理接口可用）`,
      };
    } catch (error) {
      const elapsedMs = Math.round(performance.now() - started);
      return {
        ok: false,
        elapsedMs,
        models: [],
        message:
          error instanceof Error && error.name === "AbortError"
            ? "连接超时（15 秒）"
            : `连接失败：${error instanceof Error ? error.message : "未知错误"}`,
      };
    } finally {
      clearTimeout(timer);
    }
  }

  async apply(
    profile: ProviderProfile,
    options: ApplyOptions,
  ): Promise<ApplyResult> {
    const errors = validateProfileShape(profile);
    if (errors.length) throw new Error(errors.join("\n"));
    const store = await this.readStore();
    const current = await readFileIfExists(store.configPath);
    const currentExists = current.exists;
    const currentText = current.text;
    const configChanged = options.expectedHash === null
      ? currentExists
      : options.expectedHash !== undefined &&
        options.expectedHash !== hashText(currentText);
    if (!options.force && configChanged) {
      return {
        ok: false,
        conflict: true,
        message: "config.toml 已被其他程序修改",
        snapshot: await this.snapshot(store),
      };
    }

    parseConfig(currentText);
    const previous = store.profiles.find(
      (item) => item.id === store.activeProfileId,
    );
    const normalizedProfile = normalizeProfile(profile);
    if (normalizedProfile.compatibilityProxy) {
      if (!this.compatibilityProxy) throw new Error("当前运行环境未启用协议兼容代理");
      await this.compatibilityProxy.start(
        normalizedProfile.baseUrl,
        normalizedProfile.protocol,
      );
    }
    const nextText = mergeProfile(currentText, profile, previous);
    await mkdir(path.dirname(store.configPath), { recursive: true });
    if (currentExists) await copyFile(store.configPath, `${store.configPath}.bak`);
    await writeFileAtomic(store.configPath, nextText, { encoding: "utf8" });

    const saved = {
      ...normalizeProfile(profile),
      lastUsedAt: new Date().toISOString(),
    };
    const index = store.profiles.findIndex((item) => item.id === saved.id);
    if (index >= 0) store.profiles[index] = saved;
    else store.profiles.push(saved);
    store.activeProfileId = saved.id;
    await this.writeStore(store);
    if (!saved.compatibilityProxy) {
      await this.compatibilityProxy?.stop();
    }
    const editorSync = await syncEditorDefaultModel(
      saved.defaultModel,
      this.editorAppDataPath,
    );
    const syncMessage = editorSync.failed.length
      ? `；但 ${editorSync.failed.join("、")} 默认模型同步失败`
      : editorSync.updated.length
        ? `，已同步 ${editorSync.updated.join("、")} 默认模型`
        : "";
    return {
      ok: true,
      message: `配置文件已保存并应用成功${syncMessage}`,
      snapshot: await this.snapshot(store),
    };
  }

  async syncActiveProxy(): Promise<void> {
    if (!this.compatibilityProxy) return;
    const store = await this.readStore();
    const active = store.profiles.find((profile) => profile.id === store.activeProfileId);
    const normalized = active ? normalizeProfile(active) : undefined;
    if (normalized?.compatibilityProxy) {
      await this.compatibilityProxy.start(normalized.baseUrl, normalized.protocol);
    } else {
      await this.compatibilityProxy.stop();
    }
  }

  async restore(expectedHash?: string): Promise<ApplyResult> {
    const store = await this.readStore();
    const backupPath = `${store.configPath}.bak`;
    if (!(await exists(backupPath))) throw new Error("没有可恢复的备份");
    const currentText = (await readFileIfExists(store.configPath)).text;
    if (expectedHash && expectedHash !== hashText(currentText)) {
      return {
        ok: false,
        conflict: true,
        message: "config.toml 已被其他程序修改",
        snapshot: await this.snapshot(store),
      };
    }
    const backupText = await readFile(backupPath, "utf8");
    parseConfig(backupText);
    await writeFileAtomic(store.configPath, backupText, { encoding: "utf8" });
    await writeFileAtomic(backupPath, currentText, { encoding: "utf8" });
    return {
      ok: true,
      message: "已恢复上一份备份",
      snapshot: await this.snapshot(store),
    };
  }

  async exportData(destination: string): Promise<void> {
    const store = await this.readStore();
    await writeFileAtomic(
      destination,
      `${JSON.stringify({ schemaVersion: 1, profiles: store.profiles }, null, 2)}\n`,
      { encoding: "utf8" },
    );
  }

  async importData(source: string): Promise<ImportResult> {
    const store = await this.readStore();
    const raw = JSON.parse(await readFile(source, "utf8")) as {
      schemaVersion?: unknown;
      profiles?: unknown;
    };
    if (raw.schemaVersion !== 1 || !Array.isArray(raw.profiles)) {
      throw new Error("JSON 档案版本不受支持");
    }
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const [index, value] of raw.profiles.entries()) {
      const itemErrors = validateProfileShape(value);
      if (itemErrors.length) {
        skipped += 1;
        errors.push(`第 ${index + 1} 项：${itemErrors.join("、")}`);
        continue;
      }
      const candidate = normalizeProfile(value as ProviderProfile);
      store.profiles.push({
        ...candidate,
        id: randomUUID(),
        name: duplicateName(candidate.name, store.profiles),
      });
      imported += 1;
    }
    await this.writeStore(store);
    return { imported, skipped, errors, snapshot: await this.snapshot(store) };
  }
}
