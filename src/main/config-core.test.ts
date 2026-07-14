import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "../shared/types.js";
import {
  extractProfile,
  mergeProfile,
  normalizeProfile,
  parseConfig,
  profileMatchesConfig,
  validateProfileShape,
} from "./config-core.js";

const profile: ProviderProfile = {
  id: "current",
  name: "示例供应商",
  baseUrl: "https://provider.example.com/v1/",
  apiKey: "demo-key-not-real",
  protocol: "openai-responses",
  defaultModel: "grok-4.5-latest",
  configuredModels: ["grok-4.5-latest", "grok-4.5", "grok-build"],
  modelSettings: {
    "grok-4.5-latest": {
      contextWindow: 500000,
      supportsReasoningEffort: true,
    },
    "grok-4.5": {
      contextWindow: 500000,
      supportsReasoningEffort: false,
    },
    "grok-build": {
      contextWindow: 200000,
      supportsReasoningEffort: false,
    },
  },
};

describe("config core", () => {
  it("preserves unrelated public settings and quotes dotted model names", () => {
    const current = `[cli]\ninstaller = "internal"\n\n[ui]\nyolo = false\n`;
    const merged = mergeProfile(current, profile);
    const root = parseConfig(merged) as Record<string, any>;

    expect(root.cli.installer).toBe("internal");
    expect(root.ui.yolo).toBe(false);
    expect(root.ui.fork_secondary_model).toBeUndefined();
    expect(root.endpoints.models_base_url).toBe("https://provider.example.com/v1");
    expect(root.endpoints.xai_api_base_url).toBe("https://provider.example.com/v1");
    expect(root.models.default).toBe("grok-4.5-latest");
    expect(root.model["grok-4.5-latest"].context_window).toBe(500000);
    expect(root.model["grok-4.5-latest"].api_key).toBe("demo-key-not-real");
    expect(root.model["grok-4.5-latest"].model).toBe("grok-4.5-latest");
    expect(root.model["grok-4.5-latest"].base_url).toBe("https://provider.example.com/v1");
    expect(root.model["grok-4.5-latest"].api_backend).toBe("responses");
    expect(root.model["grok-4.5-latest"].supports_reasoning_effort).toBe(true);
    expect(root.model["grok-4.5-latest"].input_modalities).toBeUndefined();
    expect(root.model["grok-4.5-latest"].supports_image_detail_original).toBeUndefined();
    expect(root.model["grok-4.5"].context_window).toBe(500000);
    expect(root.model["grok-4.5"].api_key).toBe("demo-key-not-real");
    expect(root.model["grok-4.5"].supports_reasoning_effort).toBe(false);
    expect(root.model["grok-build"].context_window).toBe(200000);
    expect(merged).toContain('[model."grok-4.5-latest"]');
  });

  it("removes managed secrets from the previous active model", () => {
    const previous: ProviderProfile = {
      ...profile,
      defaultModel: "old.model",
      configuredModels: ["old.model", "old-secondary"],
    };
    const current = `[model."old.model"]\napi_key = "old-key"\ncontext_window = 100000\ntemperature = 0.2\n\n[model.old-secondary]\napi_key = "old-key"\n`;
    const merged = mergeProfile(current, profile, previous);
    const root = parseConfig(merged) as Record<string, any>;

    expect(root.model["old.model"].api_key).toBeUndefined();
    expect(root.model["old.model"].context_window).toBeUndefined();
    expect(root.model["old.model"].temperature).toBe(0.2);
    expect(root.model["old-secondary"]).toBeUndefined();
  });

  it("does not duplicate the default model block", () => {
    const merged = mergeProfile("", {
      ...profile,
      configuredModels: [profile.defaultModel, profile.defaultModel],
    });
    const root = parseConfig(merged) as Record<string, any>;
    expect(Object.keys(root.model)).toEqual(["grok-4.5-latest"]);
  });

  it("imports a current profile and matches its managed values", () => {
    const merged = mergeProfile("", profile);
    const imported = extractProfile(merged);
    expect(imported).toMatchObject({
      baseUrl: "https://provider.example.com/v1",
      apiKey: "demo-key-not-real",
      protocol: "openai-responses",
      defaultModel: "grok-4.5-latest",
      configuredModels: ["grok-4.5-latest", "grok-4.5", "grok-build"],
      modelSettings: profile.modelSettings,
    });
    expect(profileMatchesConfig(merged, { ...profile, baseUrl: "https://provider.example.com/v1" })).toBe(true);
  });

  it("removes obsolete image capability overrides", () => {
    const current = mergeProfile("", profile).replace(
      "supports_reasoning_effort = true",
      'supports_reasoning_effort = true\ninput_modalities = ["text", "image"]\nsupports_image_detail_original = true',
    );
    const merged = mergeProfile(current, profile, profile);
    const root = parseConfig(merged) as Record<string, any>;
    expect(root.model["grok-4.5-latest"].input_modalities).toBeUndefined();
    expect(root.model["grok-4.5-latest"].supports_image_detail_original).toBeUndefined();
    expect(root.endpoints.xai_api_base_url).toBe("https://provider.example.com/v1");
  });

  it("defaults new model settings by model family", () => {
    const legacy = { ...profile } as Partial<ProviderProfile>;
    delete legacy.modelSettings;
    const normalized = normalizeProfile(legacy as ProviderProfile);

    expect(normalized.modelSettings["grok-4.5-latest"].contextWindow).toBe(500000);
    expect(normalized.modelSettings["grok-4.5"].contextWindow).toBe(500000);
    expect(normalized.modelSettings["grok-build"].contextWindow).toBe(200000);
    expect(normalized.modelSettings["grok-4.5-latest"].supportsReasoningEffort).toBe(false);
  });

  it("migrates the legacy global context window without keeping obsolete fields", () => {
    const legacy = {
      ...profile,
      modelSettings: undefined,
      contextWindow: 320000,
      imageSupport: true,
    } as unknown as ProviderProfile;
    const normalized = normalizeProfile(legacy);

    expect(normalized.modelSettings["grok-4.5-latest"].contextWindow).toBe(320000);
    expect(normalized.modelSettings["grok-build"].contextWindow).toBe(320000);
    expect(normalized).not.toHaveProperty("contextWindow");
    expect(normalized).not.toHaveProperty("imageSupport");
  });

  it("writes Anthropic Messages model configuration without xAI endpoints", () => {
    const merged = mergeProfile(
      `[endpoints]\nmodels_base_url = "https://old.example/v1"\nxai_api_base_url = "https://old.example/v1"\n`,
      { ...profile, protocol: "anthropic" },
      profile,
    );
    const root = parseConfig(merged) as Record<string, any>;

    expect(root.endpoints).toBeUndefined();
    expect(root.model["grok-4.5-latest"]).toMatchObject({
      model: "grok-4.5-latest",
      base_url: "https://provider.example.com/v1",
      api_backend: "messages",
      api_key: "demo-key-not-real",
      extra_headers: {
        "x-api-key": "demo-key-not-real",
        "anthropic-version": "2023-06-01",
      },
    });
    expect(extractProfile(merged)).toMatchObject({
      protocol: "anthropic",
      baseUrl: "https://provider.example.com/v1",
    });
  });

  it("writes the local filter proxy URL while retaining the upstream profile URL", () => {
    const proxied = {
      ...profile,
      protocol: "anthropic" as const,
      compatibilityProxy: true,
    };
    const merged = mergeProfile("", proxied);
    const root = parseConfig(merged) as Record<string, any>;
    expect(root.model["grok-4.5-latest"].base_url).toBe(
      "http://127.0.0.1:8787/v1",
    );
    expect(extractProfile(merged)).toMatchObject({
      baseUrl: "http://127.0.0.1:8787/v1",
      compatibilityProxy: true,
    });
    expect(profileMatchesConfig(merged, proxied)).toBe(true);
  });

  it("writes a proxied Responses model URL while retaining upstream endpoints", () => {
    const proxied = { ...profile, compatibilityProxy: true };
    const merged = mergeProfile("", proxied);
    const root = parseConfig(merged) as Record<string, any>;

    expect(root.endpoints.models_base_url).toBe("https://provider.example.com/v1");
    expect(root.endpoints.xai_api_base_url).toBe("https://provider.example.com/v1");
    expect(root.model["grok-4.5-latest"].base_url).toBe(
      "http://127.0.0.1:8787/v1",
    );
    expect(extractProfile(merged)).toMatchObject({
      baseUrl: "https://provider.example.com/v1",
      protocol: "openai-responses",
      compatibilityProxy: true,
    });
    expect(profileMatchesConfig(merged, proxied)).toBe(true);
  });

  it("migrates the legacy Messages proxy flag to compatibility mode", () => {
    const legacy = {
      ...profile,
      protocol: "anthropic" as const,
      messagesFilterProxy: true,
    } as ProviderProfile & { messagesFilterProxy: boolean };
    const normalized = normalizeProfile(legacy);

    expect(normalized.compatibilityProxy).toBe(true);
    expect(normalized).not.toHaveProperty("messagesFilterProxy");
  });

  it("writes OpenAI Chat Completions when selected", () => {
    const chat = {
      ...profile,
      protocol: "openai-chat" as const,
      compatibilityProxy: true,
    };
    const merged = mergeProfile("", chat);
    const root = parseConfig(merged) as Record<string, any>;
    expect(root.model["grok-4.5-latest"].api_backend).toBe("chat_completions");
    expect(root.model["grok-4.5-latest"].base_url).toBe(
      "https://provider.example.com/v1",
    );
    expect(extractProfile(merged)?.protocol).toBe("openai-chat");
    expect(normalizeProfile(chat).compatibilityProxy).toBe(false);
  });

  it("imports every model table that contains an API key", () => {
    const imported = extractProfile(`[endpoints]\nmodels_base_url = "https://example.com/v1"\n\n[models]\ndefault = "grok-a"\n\n[model.grok-a]\napi_key = "secret"\ncontext_window = 500000\n\n[model."grok-b"]\napi_key = "secret"\n`);
    expect(imported?.configuredModels).toEqual(["grok-a", "grok-b"]);
    expect(imported?.modelSettings).toEqual({
      "grok-a": { contextWindow: 500000, supportsReasoningEffort: false },
      "grok-b": { contextWindow: 200000, supportsReasoningEffort: false },
    });
  });

  it("validates required fields and context window", () => {
    expect(validateProfileShape({ ...profile, baseUrl: "invalid", apiKey: "", contextWindow: -1 })).toEqual([
      "Base URL 必须是有效的 HTTP 或 HTTPS 地址",
      "API Key 不能为空",
      "上下文窗口必须是正整数",
    ]);
  });

  it("defaults legacy profiles without a protocol to OpenAI Responses", () => {
    const legacy = { ...profile } as Partial<ProviderProfile>;
    delete legacy.protocol;
    const merged = mergeProfile("", legacy as ProviderProfile);
    expect(extractProfile(merged)?.protocol).toBe("openai-responses");
  });

  it("validates per-model context and reasoning capability settings", () => {
    expect(validateProfileShape({
      ...profile,
      modelSettings: {
        "grok-4.5": { contextWindow: 0, supportsReasoningEffort: "yes" },
      },
    })).toContain("模型能力设置无效");
  });
});
