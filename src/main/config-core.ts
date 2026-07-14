import { createHash, randomUUID } from "node:crypto";
import { parse, stringify } from "smol-toml";
import {
  defaultConfiguredModelSettings,
} from "../shared/model-settings.js";
import type {
  ApiProtocol,
  ConfiguredModelSettings,
  ProviderProfile,
} from "../shared/types.js";

type TomlRecord = Record<string, unknown>;
export const COMPATIBILITY_PROXY_BASE_URL = "http://127.0.0.1:8787/v1";

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

function normalizedModelSettings(
  profile: ProviderProfile,
  ids = modelIds(profile),
): Record<string, ConfiguredModelSettings> {
  const raw =
    profile.modelSettings &&
    typeof profile.modelSettings === "object" &&
    !Array.isArray(profile.modelSettings)
      ? profile.modelSettings
      : {};
  const legacyContextWindow = positiveInteger(profile.contextWindow);
  return Object.fromEntries(
    ids.map((modelId) => {
      const candidate = raw[modelId] as Partial<ConfiguredModelSettings> | undefined;
      const defaults = defaultConfiguredModelSettings(modelId);
      return [
        modelId,
        {
          contextWindow:
            positiveInteger(candidate?.contextWindow) ??
            legacyContextWindow ??
            defaults.contextWindow,
          supportsReasoningEffort: candidate?.supportsReasoningEffort === true,
        },
      ];
    }),
  );
}

function modelSettingsSignature(profile: ProviderProfile): string {
  const settings = normalizedModelSettings(profile);
  return JSON.stringify(
    Object.fromEntries(
      Object.keys(settings)
        .sort()
        .map((modelId) => [modelId, settings[modelId]]),
    ),
  );
}

export function normalizeProfile(profile: ProviderProfile): ProviderProfile {
  const legacy = profile as ProviderProfile & {
    messagesFilterProxy?: unknown;
    secondaryModel?: unknown;
  };
  const protocol =
    profile.protocol === "anthropic" || profile.protocol === "openai-chat"
      ? profile.protocol
      : "openai-responses";
  const configuredModels = modelIds(profile);
  const normalized = {
    ...profile,
    protocol,
    configuredModels,
    modelSettings: normalizedModelSettings(profile, configuredModels),
    compatibilityProxy:
      protocol !== "openai-chat" &&
      (profile.compatibilityProxy === true ||
        (protocol === "anthropic" && legacy.messagesFilterProxy === true)),
  } as ProviderProfile & {
    messagesFilterProxy?: unknown;
    secondaryModel?: unknown;
    contextWindow?: number;
    imageSupport?: boolean;
  };
  delete normalized.messagesFilterProxy;
  delete normalized.secondaryModel;
  delete normalized.contextWindow;
  delete normalized.imageSupport;
  return normalized;
}

export function effectiveBaseUrl(profile: ProviderProfile): string {
  const normalized = normalizeProfile(profile);
  return normalized.compatibilityProxy
    ? COMPATIBILITY_PROXY_BASE_URL
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
  const modelBaseUrl =
    text(defaultTable.base_url) || text(firstConfiguredTable.base_url);
  const endpointBaseUrl =
    text(endpoints.models_base_url) || text(endpoints.xai_api_base_url);
  const protocol = protocolFromBackend(
    defaultTable.api_backend || firstConfiguredTable.api_backend,
  );
  const compatibilityProxy =
    modelBaseUrl.replace(/\/+$/, "") === COMPATIBILITY_PROXY_BASE_URL;
  const baseUrl =
    compatibilityProxy && protocol !== "anthropic"
      ? endpointBaseUrl || modelBaseUrl
      : modelBaseUrl || endpointBaseUrl;
  const extraHeaders =
    defaultTable.extra_headers &&
    typeof defaultTable.extra_headers === "object" &&
    !Array.isArray(defaultTable.extra_headers)
      ? (defaultTable.extra_headers as TomlRecord)
      : {};
  const modelSettings = Object.fromEntries(
    configuredModels.map((modelId) => {
      const config = table(modelTables, modelId);
      const defaults = defaultConfiguredModelSettings(modelId);
      return [
        modelId,
        {
          contextWindow:
            positiveInteger(config.context_window) ?? defaults.contextWindow,
          supportsReasoningEffort: config.supports_reasoning_effort === true,
        },
      ];
    }),
  );

  if (!baseUrl && !defaultModel) return null;

  return {
    id: randomUUID(),
    name,
    baseUrl,
    apiKey:
      text(defaultTable.api_key) ||
      text(extraHeaders["x-api-key"]) ||
      text(firstConfiguredTable.api_key),
    protocol,
    compatibilityProxy,
    defaultModel,
    configuredModels,
    modelSettings,
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
    delete record.supports_reasoning_effort;
    delete record.input_modalities;
    delete record.supports_image_detail_original;
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

  const modelBaseUrl = effectiveBaseUrl(normalized);
  const upstreamBaseUrl = normalized.baseUrl.replace(/\/+$/, "");
  const endpoints = table(root, "endpoints");
  if (normalized.protocol === "anthropic") {
    delete endpoints.models_base_url;
    delete endpoints.xai_api_base_url;
    if (Object.keys(endpoints).length === 0) delete root.endpoints;
  } else {
    endpoints.models_base_url = upstreamBaseUrl;
    endpoints.xai_api_base_url = upstreamBaseUrl;
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
    config.base_url = modelBaseUrl;
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
    const settings =
      normalized.modelSettings[modelId] ?? defaultConfiguredModelSettings(modelId);
    config.context_window = settings.contextWindow;
    config.supports_reasoning_effort = settings.supportsReasoningEffort;
    delete config.input_modalities;
    delete config.supports_image_detail_original;
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
    const normalized = normalizeProfile(profile);
    const expectedBaseUrl =
      normalized.compatibilityProxy && normalized.protocol === "anthropic"
        ? effectiveBaseUrl(normalized)
        : normalized.baseUrl.replace(/\/+$/, "");
    return Boolean(
      current &&
        current.baseUrl.replace(/\/+$/, "") === expectedBaseUrl &&
        current.apiKey === profile.apiKey &&
        current.protocol === normalized.protocol &&
        current.compatibilityProxy === normalized.compatibilityProxy &&
        current.defaultModel === profile.defaultModel &&
        modelSettingsSignature(current) === modelSettingsSignature(normalized) &&
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
  const rawModelSettings = (value as { modelSettings?: unknown }).modelSettings;
  if (
    rawModelSettings !== undefined &&
    (!rawModelSettings ||
      typeof rawModelSettings !== "object" ||
      Array.isArray(rawModelSettings) ||
      Object.entries(rawModelSettings).some(([, settings]) => {
        if (!settings || typeof settings !== "object" || Array.isArray(settings)) return true;
        const item = settings as Partial<ConfiguredModelSettings>;
        return (
          (item.contextWindow !== undefined &&
            (!Number.isInteger(item.contextWindow) || item.contextWindow <= 0)) ||
          (item.supportsReasoningEffort !== undefined &&
            typeof item.supportsReasoningEffort !== "boolean")
        );
      }))
  ) {
    errors.push("模型能力设置无效");
  }
  return errors;
}
