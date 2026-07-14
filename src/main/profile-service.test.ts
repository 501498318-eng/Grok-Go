import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderProfile } from "../shared/types.js";
import { ApiCompatibilityProxy } from "./api-compatibility-proxy.js";
import { ProfileService } from "./profile-service.js";

const tempDirs: string[] = [];
async function fixture(compatibilityProxy?: ApiCompatibilityProxy) {
  const root = await mkdtemp(path.join(os.tmpdir(), "grok-switcher-"));
  tempDirs.push(root);
  const configPath = path.join(root, ".grok", "config.toml");
  const service = new ProfileService(
    path.join(root, "data"),
    configPath,
    path.join(root, "appdata"),
    compatibilityProxy,
  );
  return { root, configPath, service };
}

const profile: ProviderProfile = {
  id: "provider-a",
  name: "Provider A",
  baseUrl: "https://provider.example/v1",
  apiKey: "sk-a",
  protocol: "openai-responses",
  defaultModel: "grok-4.5-latest",
  configuredModels: ["grok-4.5-latest", "grok-4.5", "grok-build"],
  modelSettings: {
    "grok-4.5-latest": { contextWindow: 500000, supportsReasoningEffort: true },
    "grok-4.5": { contextWindow: 500000, supportsReasoningEffort: false },
    "grok-build": { contextWindow: 200000, supportsReasoningEffort: false },
  },
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProfileService", () => {
  it("imports the existing config on first launch", async () => {
    const { configPath, service } = await fixture();
    await writeFile(configPath, `[endpoints]\nmodels_base_url = "https://old.example/v1"\n\n[models]\ndefault = "grok-old"\n\n[model.grok-old]\napi_key = "old"\n`, { flag: "wx" }).catch(async () => {
      const { mkdir } = await import("node:fs/promises");
      await mkdir(path.dirname(configPath), { recursive: true });
      await writeFile(configPath, `[endpoints]\nmodels_base_url = "https://old.example/v1"\n\n[models]\ndefault = "grok-old"\n\n[model.grok-old]\napi_key = "old"\n`);
    });
    const snapshot = await service.snapshot();
    expect(snapshot.profiles).toHaveLength(1);
    expect(snapshot.profiles[0]).toMatchObject({ defaultModel: "grok-old", apiKey: "old" });
  });

  it("creates an editable blank profile when config.toml is missing", async () => {
    const { service } = await fixture();
    const snapshot = await service.snapshot();
    expect(snapshot.configExists).toBe(false);
    expect(snapshot.profiles).toHaveLength(1);
    expect(snapshot.profiles[0]).toMatchObject({ name: "新供应商", baseUrl: "https://" });
    expect(snapshot.profiles[0].configuredModels).toEqual([]);
    expect(snapshot.profiles[0].modelSettings).toEqual({});
    expect(snapshot.profiles[0].protocol).toBe("openai-responses");
  });

  it("migrates a legacy auxiliary model into configured models", async () => {
    const { root, service } = await fixture();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(root, "data"), { recursive: true });
    await writeFile(path.join(root, "data", "profiles.json"), JSON.stringify({
      schemaVersion: 1,
      configPath: path.join(root, ".grok", "config.toml"),
      profiles: [{
        id: "legacy",
        name: "旧档案",
        baseUrl: "https://legacy.example/v1",
        apiKey: "old-key",
        protocol: "anthropic",
        messagesFilterProxy: true,
        defaultModel: "grok-main",
        secondaryModel: "grok-helper",
        contextWindow: 256000,
      }],
    }));
    const snapshot = await service.snapshot();
    expect(snapshot.profiles[0].configuredModels).toEqual(["grok-main", "grok-helper"]);
    expect(snapshot.profiles[0].modelSettings).toEqual({
      "grok-main": { contextWindow: 256000, supportsReasoningEffort: false },
      "grok-helper": { contextWindow: 256000, supportsReasoningEffort: false },
    });
    expect(snapshot.profiles[0].compatibilityProxy).toBe(true);
    expect(snapshot.profiles[0]).not.toHaveProperty("messagesFilterProxy");
    expect(snapshot.profiles[0]).not.toHaveProperty("secondaryModel");
  });

  it("starts the selected protocol rule and stops it for direct profiles", async () => {
    const proxy = new ApiCompatibilityProxy();
    const start = vi.spyOn(proxy, "start").mockResolvedValue();
    const stop = vi.spyOn(proxy, "stop").mockResolvedValue();
    const { service } = await fixture(proxy);

    const applied = await service.apply(
      { ...profile, compatibilityProxy: true },
      { expectedHash: null },
    );
    expect(applied.ok).toBe(true);
    expect(start).toHaveBeenCalledWith(
      "https://provider.example/v1",
      "openai-responses",
    );
    expect(stop).not.toHaveBeenCalled();

    await service.apply(
      { ...profile, compatibilityProxy: false },
      { expectedHash: applied.snapshot.configHash },
    );
    expect(stop).toHaveBeenCalledOnce();
  });

  it("creates one backup, applies atomically, and swaps on restore", async () => {
    const { configPath, service } = await fixture();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(configPath), { recursive: true });
    const original = `[cli]\ninstaller = "internal"\n`;
    await writeFile(configPath, original);
    const before = await service.snapshot();
    const applied = await service.apply(profile, { expectedHash: before.configHash });
    expect(applied.ok).toBe(true);
    expect(await readFile(`${configPath}.bak`, "utf8")).toBe(original);
    expect(await readFile(configPath, "utf8")).toContain("grok-4.5-latest");

    const restored = await service.restore(applied.snapshot.configHash);
    expect(restored.ok).toBe(true);
    expect(await readFile(configPath, "utf8")).toBe(original);
    expect(await readFile(`${configPath}.bak`, "utf8")).toContain("grok-4.5-latest");
  });

  it("reports a concurrent file change instead of overwriting", async () => {
    const { configPath, service } = await fixture();
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, "[cli]\ninstaller = \"internal\"\n");
    const snapshot = await service.snapshot();
    await writeFile(configPath, "[cli]\ninstaller = \"external\"\n");
    const result = await service.apply(profile, { expectedHash: snapshot.configHash });
    expect(result.conflict).toBe(true);
    expect(await readFile(configPath, "utf8")).toContain("external");
  });

  it("reports a conflict when a missing config is created before apply", async () => {
    const { configPath, service } = await fixture();
    const { mkdir } = await import("node:fs/promises");
    const snapshot = await service.snapshot();
    expect(snapshot.configExists).toBe(false);

    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFile(configPath, '[cli]\ninstaller = "external"\n');
    const result = await service.apply(profile, { expectedHash: null });

    expect(result.conflict).toBe(true);
    expect(await readFile(configPath, "utf8")).toContain("external");
  });

  it("validates an OpenAI-compatible model list", async () => {
    const { service } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "grok-build" }, { id: "grok-4.5" }] }),
    }));
    const result = await service.validate(profile);
    expect(result.ok).toBe(true);
    expect(result.models).toEqual(["grok-4.5", "grok-build"]);
    expect(result.message).toContain("不代表推理接口可用");
  });

  it("returns an actionable authentication failure", async () => {
    const { service } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 401 }));
    const result = await service.validate(profile);
    expect(result).toMatchObject({ ok: false, status: 401, message: "连接失败（HTTP 401）" });
  });

  it("uses Anthropic headers when validating a Messages provider", async () => {
    const { service } = await fixture();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: [{ id: "grok-4.5" }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await service.validate({ ...profile, protocol: "anthropic" });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://provider.example/v1/models",
      expect.objectContaining({
        headers: {
          "x-api-key": "sk-a",
          "anthropic-version": "2023-06-01",
        },
      }),
    );
  });

  it("explains that Anthropic model discovery may be unsupported", async () => {
    const { service } = await fixture();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    const result = await service.validate({ ...profile, protocol: "anthropic" });
    expect(result.message).toContain("手动添加模型后强制应用");
  });

  it("imports valid JSON profiles as copies and reports invalid entries", async () => {
    const { root, service } = await fixture();
    await service.saveProfile(profile);
    const importPath = path.join(root, "import.json");
    await writeFile(importPath, JSON.stringify({ schemaVersion: 1, profiles: [profile, {}] }));
    const result = await service.importData(importPath);
    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.errors[0]).toContain("供应商名称不能为空");
    expect(result.snapshot.profiles.some((item) => item.name === "Provider A 副本")).toBe(true);
  });

  it("exports a versioned JSON document including the configured key", async () => {
    const { root, service } = await fixture();
    await service.saveProfile(profile);
    const exportPath = path.join(root, "export.json");
    await service.exportData(exportPath);
    const payload = JSON.parse(await readFile(exportPath, "utf8"));
    expect(payload.schemaVersion).toBe(1);
    expect(payload.profiles).toContainEqual(expect.objectContaining({ apiKey: "sk-a" }));
  });
});
