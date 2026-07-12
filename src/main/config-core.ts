import { createHash, randomUUID } from "node:crypto";
import { parse, stringify } from "smol-toml";
import type { ApiProtocol, ProviderProfile } from "../shared/types.js";

type TomlRecord = Record<string, unknown>;
export const MESSAGES_FILTER_PROXY_BASE_URL = "http://127.0.0.1:8787/v1";

function table(parent: TomlRecord, key: string): TomlRecord {
  const value = parent[key];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as TomlRecord;
  }
  const created: TomlRecord = {};
  parent[key] = created;
  return created;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

function protocolFromBackend(value: unknown): ApiProtocol {
  if (value === "messages") return "anthropic";
  if (value === "chat_completions") return "openai-chat";
  return "openai-responses";
}

function backendForProtocol(protocol: ApiProtocol): string {
  if (protocol === "anthropic") return "messages";
  if (protocol === "openai-chat") return "chat_completions";
  return "responses";
}

function modelIds(profile: ProviderProfile): string[] {
  const legacySecondary = (profile as ProviderProfile & { secondaryModel?: unknown })
    .secondaryModel;
  const candidates = [
    ...(typeof profile.defaultModel === "string" ? [profile.defaultModel] : []),
    ...(Array.isArray(profile.configuredModels) ? profile.configuredModels : []),
    ...(typeof legacySecondary === "string" ? [legacySecondary] : []),
  ];
  return [
    ...new Set(
      candidates
        .filter((value): value is string => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function normalizeProfile(profile: ProviderProfile): ProviderProfile {
  const normalized = {
    ...profile,
    protocol:
      profile.protocol === "anthropic" || profile.protocol === "openai-chat"
        ? profile.protocol
        : "openai-responses",
    configuredModels: modelIds(profile),
    imageSupport: typeof profile.imageSupport === "boolean" ? profile.imageSupport : true,
    messagesFilterProxy:
      profile.protocol === "anthropic" && profile.messagesFilterProxy === true,
  } as ProviderProfile & { secondaryModel?: unknown };
  delete normalized.secondaryModel;
  return normalized;
}

export function effectiveBaseUrl(profile: ProviderProfile): string {
  const normalized = normalizeProfile(profile);
  return normalized.messagesFilterProxy
    ? MESSAGES_FILTER_PROXY_BASE_URL
    : normalized.baseUrl.replace(/\/+$/, "");
}

export function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function parseConfig(value: string): TomlRecord {
  if (!value.trim()) return {};
  return parse(value) as TomlRecord;
}

export function extractProfile(
  value: string,
  name = "当前配置",
): ProviderProfile | null {
  return extractProfileFromRoot(parseConfig(value), name);
}

function extractProfileFromRoot(
  root: TomlRecord,
  name: string,
): ProviderProfile | null {
  const endpoints = table(root, "endpoints");
  const models = table(root, "models");
  const modelTables = table(root, "model");
  const defaultModel = text(models.default);
  const defaultTable = defaultModel
    ? table(modelTables, defaultModel)
    : ({} as TomlRecord);
  const configuredModels = Object.entries(modelTables)
    .filter(([, config]) => {
      if (!config || typeof config !== "object" || Array.isArray(config)) return false;
      return Boolean(text((config as TomlRecord).api_key));
    })
    .map(([modelId]) => modelId);
  if (defaultModel && !configuredModels.includes(defaultModel)) {
    configuredModels.unshift(defaultModel);
  }
  const firstConfiguredTable = configuredModels.length
    ? table(modelTables, configuredModels[0])
    : ({} as TomlRecord);
  const baseUrl =
    text(defaultTable.base_url) ||
    text(firstConfiguredTable.base_url) ||
    text(endpoints.models_base_url) ||
    text(endpoints.xai_api_base_url);
  const inputModalities = defaultTable.input_modalities;
  const supportsOriginal = defaultTable.supports_image_detail_original;
  const extraHeaders =
    defaultTable.extra_headers &&
    typeof defaultTable.extra_headers === "object" &&
    !Array.isArray(defaultTable.extra_headers)
      ? (defaultTable.extra_headers as TomlRecord)
      : {};
  const hasImageCapabilityOverride =
    Array.isArray(inputModalities) || typeof supportsOriginal === "boolean";
  const imageSupport = hasImageCapabilityOverride
    ? (Array.isArray(inputModalities) && inputModalities.includes("image")) ||
      supportsOriginal === true
    : true;

  if (!baseUrl && !defaultModel) return null;

  return {
    id: randomUUID(),
    name,
    baseUrl,
    apiKey:
      text(defaultTable.api_key) ||
      text(extraHeaders["x-api-key"]) ||
      text(firstConfiguredTable.api_key),
    protocol: protocolFromBackend(
      defaultTable.api_backend || firstConfiguredTable.api_backend,
    ),
    messagesFilterProxy:
      text(defaultTable.base_url).replace(/\/+$/, "") ===
      MESSAGES_FILTER_PROXY_BASE_URL,
    defaultModel,
    configuredModels,
    contextWindow: positiveInteger(defaultTable.context_window),
    imageSupport,
  };
}

function removeManagedFields(root: TomlRecord, profile?: ProviderProfile): void {
  if (!profile) return;
  const models = table(root, "model");
  for (const modelId of modelIds(profile)) {
    const config = models[modelId];
    if (!config || typeof config !== "object" || Array.isArray(config)) continue;
    const record = config as TomlRecord;
    delete record.api_key;
    delete record.context_window;
    delete record.model;
    delete record.base_url;
    delete record.api_backend;
    delete record.extra_headers;
    if (modelId === profile.defaultModel) {
      delete record.input_modalities;
      delete record.supports_image_detail_original;
    }
    if (Object.keys(record).length === 0) delete models[modelId];
  }
}

export function mergeProfile(
  currentText: string,
  profile: ProviderProfile,
  previousProfile?: ProviderProfile,
): string {
  const root = parseConfig(currentText);
  removeManagedFields(root, previousProfile);
  const normalized = normalizeProfile(profile);

  const baseUrl = effectiveBaseUrl(normalized);
  const endpoints = table(root, "endpoints");
  if (normalized.protocol === "anthropic") {
    delete endpoints.models_base_url;
    delete endpoints.xai_api_base_url;
    if (Object.keys(endpoints).length === 0) delete root.endpoints;
  } else {
    endpoints.models_base_url = baseUrl;
    endpoints.xai_api_base_url = baseUrl;
  }
  table(root, "models").default = normalized.defaultModel;

  const ui = root.ui;
  if (ui && typeof ui === "object" && !Array.isArray(ui)) {
    delete (ui as TomlRecord).fork_secondary_model;
    if (Object.keys(ui as TomlRecord).length === 0) delete root.ui;
  }

  const modelTables = table(root, "model");
  for (const modelId of normalized.configuredModels) {
    const config = table(modelTables, modelId);
    config.model = modelId;
    config.base_url = baseUrl;
    config.api_backend = backendForProtocol(normalized.protocol);
    config.api_key = normalized.apiKey;
    if (normalized.protocol === "anthropic") {
      config.extra_headers = {
        "x-api-key": normalized.apiKey,
        "anthropic-version": "2023-06-01",
      };
    } else {
      delete config.extra_headers;
    }
    if (normalized.contextWindow) config.context_window = normalized.contextWindow;
    else delete config.context_window;
  }
  const defaultConfig = table(modelTables, normalized.defaultModel);
  if (normalized.imageSupport) {
    defaultConfig.input_modalities = ["text", "image"];
    defaultConfig.supports_image_detail_original = true;
  } else {
    delete defaultConfig.input_modalities;
    delete defaultConfig.supports_image_detail_original;
  }

  return `${stringify(root)}\n`;
}

export function profileMatchesConfig(
  configText: string,
  profile?: ProviderProfile,
): boolean {
  if (!profile) return false;
  try {
    const root = parseConfig(configText);
    const current = extractProfileFromRoot(root, "当前配置");
    return Boolean(
      current &&
        current.baseUrl.replace(/\/+$/, "") === effectiveBaseUrl(profile) &&
        current.apiKey === profile.apiKey &&
        current.protocol === normalizeProfile(profile).protocol &&
        current.messagesFilterProxy === normalizeProfile(profile).messagesFilterProxy &&
        current.defaultModel === profile.defaultModel &&
        current.contextWindow === profile.contextWindow &&
        current.imageSupport === normalizeProfile(profile).imageSupport &&
        JSON.stringify([...current.configuredModels].sort()) ===
          JSON.stringify([...modelIds(profile)].sort()),
    );
  } catch {
    return false;
  }
}

export function validateProfileShape(profile: unknown): string[] {
  const errors: string[] = [];
  const value = (profile && typeof profile === "object" ? profile : {}) as Partial<ProviderProfile>;
  if (typeof value.name !== "string" || !value.name.trim()) errors.push("供应商名称不能为空");
  try {
    const url = new URL(typeof value.baseUrl === "string" ? value.baseUrl : "");
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    errors.push("Base URL 必须是有效的 HTTP 或 HTTPS 地址");
  }
  if (typeof value.apiKey !== "string" || !value.apiKey.trim()) errors.push("API Key 不能为空");
  if (
    value.protocol !== undefined &&
    value.protocol !== "openai-responses" &&
    value.protocol !== "openai-chat" &&
    value.protocol !== "anthropic"
  ) {
    errors.push("接口协议无效");
  }
  if (typeof value.defaultModel !== "string" || !value.defaultModel.trim()) errors.push("默认模型不能为空");
  if (
    value.configuredModels !== undefined &&
    (!Array.isArray(value.configuredModels) ||
      value.configuredModels.some((modelId) => typeof modelId !== "string" || !modelId.trim()))
  ) {
    errors.push("已配置模型列表无效");
  }
  if (value.imageSupport !== undefined && typeof value.imageSupport !== "boolean") {
    errors.push("图片能力设置无效");
  }
  if (
    value.contextWindow !== undefined &&
    (!Number.isInteger(value.contextWindow) || value.contextWindow <= 0)
  ) {
    errors.push("上下文窗口必须是正整数");
  }
  return errors;
}
