import { describe, expect, it } from "vitest";
import type { ProviderProfile } from "../shared/types.js";
import {
  extractProfile,
  mergeProfile,
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
  contextWindow: 500000,
  imageSupport: true,
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
    expect(root.model["grok-4.5-latest"].input_modalities).toEqual(["text", "image"]);
    expect(root.model["grok-4.5-latest"].supports_image_detail_original).toBe(true);
    expect(root.model["grok-4.5"].context_window).toBe(500000);
    expect(root.model["grok-4.5"].api_key).toBe("demo-key-not-real");
    expect(root.model["grok-4.5"].input_modalities).toBeUndefined();
    expect(root.model["grok-build"].context_window).toBe(500000);
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
      contextWindow: 500000,
      configuredModels: ["grok-4.5-latest", "grok-4.5", "grok-build"],
      imageSupport: true,
    });
    expect(profileMatchesConfig(merged, { ...profile, baseUrl: "https://provider.example.com/v1" })).toBe(true);
  });

  it("removes image capability overrides when image support is disabled", () => {
    const current = mergeProfile("", profile);
    const merged = mergeProfile(current, { ...profile, imageSupport: false }, profile);
    const root = parseConfig(merged) as Record<string, any>;
    expect(root.model["grok-4.5-latest"].input_modalities).toBeUndefined();
    expect(root.model["grok-4.5-latest"].supports_image_detail_original).toBeUndefined();
    expect(root.endpoints.xai_api_base_url).toBe("https://provider.example.com/v1");
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
      messagesFilterProxy: true,
    };
    const merged = mergeProfile("", proxied);
    const root = parseConfig(merged) as Record<string, any>;
    expect(root.model["grok-4.5-latest"].base_url).toBe(
      "http://127.0.0.1:8787/v1",
    );
    expect(extractProfile(merged)).toMatchObject({
      baseUrl: "http://127.0.0.1:8787/v1",
      messagesFilterProxy: true,
    });
    expect(profileMatchesConfig(merged, proxied)).toBe(true);
  });

  it("writes OpenAI Chat Completions when selected", () => {
    const merged = mergeProfile("", { ...profile, protocol: "openai-chat" });
    const root = parseConfig(merged) as Record<string, any>;
    expect(root.model["grok-4.5-latest"].api_backend).toBe("chat_completions");
    expect(extractProfile(merged)?.protocol).toBe("openai-chat");
  });

  it("imports every model table that contains an API key", () => {
    const imported = extractProfile(`[endpoints]\nmodels_base_url = "https://example.com/v1"\n\n[models]\ndefault = "grok-a"\n\n[model.grok-a]\napi_key = "secret"\ncontext_window = 500000\n\n[model."grok-b"]\napi_key = "secret"\n`);
    expect(imported?.configuredModels).toEqual(["grok-a", "grok-b"]);
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
});
