import type { ProviderProfile } from "../../shared/types";

export const PROFILE_COLORS = [
  "#0ea5e9",
  "#0f172a",
  "#f59e0b",
  "#8b5cf6",
  "#10b981",
  "#f43f5e",
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
    contextWindow: 256000,
    imageSupport: true,
    messagesFilterProxy: false,
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
  const baseUrl =
    profile.protocol === "anthropic" && profile.messagesFilterProxy
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
    lines.push("", `[model."${escaped(modelId)}"]`);
    lines.push(`model = "${escaped(modelId)}"`);
    lines.push(`base_url = "${escaped(baseUrl)}"`);
    lines.push(`api_backend = "${backend}"`);
    if (profile.contextWindow) lines.push(`context_window = ${profile.contextWindow}`);
    lines.push('api_key = "••••••••••••••••"');
    if (profile.protocol === "anthropic") {
      lines.push(
        'extra_headers = { "x-api-key" = "••••••••••••••••", "anthropic-version" = "2023-06-01" }',
      );
    }
    if (modelId === profile.defaultModel && profile.imageSupport) {
      lines.push('input_modalities = ["text", "image"]');
      lines.push("supports_image_detail_original = true");
    }
  }
  return lines;
}
