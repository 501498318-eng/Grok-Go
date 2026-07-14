import { defaultConfiguredModelSettings } from "../../shared/model-settings";
import type { ApiProtocol, ProviderProfile } from "../../shared/types";

/** Swiss chip palette used for profile avatars */
export const PROFILE_COLORS = [
  "#002FA7",
  "#14110E",
  "#FF6B35",
  "#3D3566",
  "#0A7A3E",
  "#8A6A00",
];

export function blankProfile(): ProviderProfile {
  return {
    id: crypto.randomUUID(),
    name: "新供应商",
    baseUrl: "https://",
    apiKey: "",
    protocol: "openai-responses",
    defaultModel: "",
    configuredModels: [],
    modelSettings: {},
    compatibilityProxy: false,
  };
}

export function cloneProfile(profile: ProviderProfile): ProviderProfile {
  return {
    ...profile,
    configuredModels: [...profile.configuredModels],
    modelSettings: Object.fromEntries(
      Object.entries(profile.modelSettings ?? {}).map(([modelId, settings]) => [
        modelId,
        { ...settings },
      ]),
    ),
  };
}

export function configuredModelIds(profile: ProviderProfile): string[] {
  return [
    ...new Set(
      [profile.defaultModel, ...profile.configuredModels]
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
}

export function formatDate(value?: string): string {
  if (!value) return "尚未使用";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function protocolCode(protocol: ApiProtocol): string {
  if (protocol === "anthropic") return "messages";
  if (protocol === "openai-chat") return "chat";
  return "responses";
}

export function protocolBackendLabel(protocol: ApiProtocol): string {
  if (protocol === "anthropic") return "messages";
  if (protocol === "openai-chat") return "chat_completions";
  return "responses";
}

export function hostFromBaseUrl(baseUrl: string): string {
  try {
    const url = new URL(baseUrl);
    return url.host || baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "") || "—";
  }
}

export function classifyTomlLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) return "toml-section";
  if (trimmed.includes("=") && /".*"/.test(trimmed)) return "toml-string";
  if (trimmed.includes("=")) return "toml-key";
  return "";
}

export function tomlPreview(profile: ProviderProfile): string[] {
  const escaped = (value: string) =>
    value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const backend =
    profile.protocol === "anthropic"
      ? "messages"
      : profile.protocol === "openai-chat"
        ? "chat_completions"
        : "responses";
  const baseUrl = profile.compatibilityProxy
    ? "http://127.0.0.1:8787/v1"
    : profile.baseUrl.replace(/\/+$/, "");
  const lines =
    profile.protocol === "anthropic"
      ? ["[models]"]
      : [
          "[endpoints]",
          `models_base_url = "${escaped(profile.baseUrl)}"`,
          `xai_api_base_url = "${escaped(profile.baseUrl)}"`,
          "",
          "[models]",
        ];
  lines.push(`default = "${escaped(profile.defaultModel)}"`);
  for (const modelId of configuredModelIds(profile)) {
    const settings =
      profile.modelSettings?.[modelId] ?? defaultConfiguredModelSettings(modelId);
    lines.push("", `[model."${escaped(modelId)}"]`);
    lines.push(`model = "${escaped(modelId)}"`);
    lines.push(`base_url = "${escaped(baseUrl)}"`);
    lines.push(`api_backend = "${backend}"`);
    lines.push(`context_window = ${settings.contextWindow}`);
    lines.push(
      `supports_reasoning_effort = ${settings.supportsReasoningEffort ? "true" : "false"}`,
    );
    lines.push('api_key = "••••••••••••••••"');
    if (profile.protocol === "anthropic") {
      lines.push(
        'extra_headers = { "x-api-key" = "••••••••••••••••", "anthropic-version" = "2023-06-01" }',
      );
    }
  }
  return lines;
}
