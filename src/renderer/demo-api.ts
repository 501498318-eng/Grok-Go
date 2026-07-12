import type {
  AppSnapshot,
  GrokApi,
  ProfileStore,
  ProviderProfile,
} from "../shared/types";

const now = new Date().toISOString();
const seed: ProviderProfile[] = [
  {
    id: "example",
    name: "示例供应商",
    baseUrl: "https://provider.example.com/v1",
    apiKey: "demo-key-not-real",
    protocol: "openai-responses",
    messagesFilterProxy: false,
    defaultModel: "grok-4.5-latest",
    configuredModels: ["grok-4.5-latest", "grok-4.5", "grok-build"],
    contextWindow: 500000,
    imageSupport: true,
    lastValidatedAt: now,
    lastUsedAt: now,
  },
  {
    id: "xai",
    name: "官方 xAI",
    baseUrl: "https://api.x.ai/v1",
    apiKey: "demo-key-not-real",
    protocol: "openai-responses",
    messagesFilterProxy: false,
    defaultModel: "grok-4",
    configuredModels: ["grok-4"],
    contextWindow: 256000,
    imageSupport: true,
  },
  {
    id: "backup",
    name: "备用节点",
    baseUrl: "https://backup.example.com/v1",
    apiKey: "demo-key-not-real",
    protocol: "anthropic",
    messagesFilterProxy: true,
    defaultModel: "grok-4.5",
    configuredModels: ["grok-4.5"],
    imageSupport: true,
  },
  {
    id: "local",
    name: "本地代理",
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "demo-key-not-real",
    protocol: "openai-chat",
    messagesFilterProxy: false,
    defaultModel: "grok-local",
    configuredModels: ["grok-local"],
    imageSupport: false,
  },
];

let store: ProfileStore = {
  schemaVersion: 1,
  configPath: "C:\\Users\\Example\\.grok\\config.toml",
  activeProfileId: "example",
  profiles: seed,
};

const configFor = (profile: ProviderProfile) => {
  const modelIds = [...new Set([profile.defaultModel, ...profile.configuredModels])];
  const backend = profile.protocol === "anthropic" ? "messages" : profile.protocol === "openai-chat" ? "chat_completions" : "responses";
  const modelTables = modelIds.map((modelId) =>
    `[model."${modelId}"]\nmodel = "${modelId}"\nbase_url = "${profile.protocol === "anthropic" && profile.messagesFilterProxy ? "http://127.0.0.1:8787/v1" : profile.baseUrl}"\napi_backend = "${backend}"\ncontext_window = ${profile.contextWindow ?? 256000}\napi_key = "${profile.apiKey}"${modelId === profile.defaultModel && profile.imageSupport ? '\ninput_modalities = ["text", "image"]\nsupports_image_detail_original = true' : ""}`,
  );
  const endpoints = profile.protocol === "anthropic" ? "" : `[endpoints]\nmodels_base_url = "${profile.baseUrl}"\nxai_api_base_url = "${profile.baseUrl}"\n\n`;
  return `${endpoints}[models]\ndefault = "${profile.defaultModel}"\n\n${modelTables.join("\n\n")}\n`;
};

const snapshot = (): AppSnapshot => {
  const active = store.profiles.find((item) => item.id === store.activeProfileId);
  return {
    ...store,
    configExists: true,
    backupExists: true,
    configText: active ? configFor(active) : "",
    configHash: "demo-hash",
    activeMatchesConfig: true,
  };
};

export function createDemoApi(): GrokApi {
  return {
    loadSnapshot: async () => snapshot(),
    saveProfile: async (profile) => {
      const index = store.profiles.findIndex((item) => item.id === profile.id);
      if (index >= 0) store.profiles[index] = profile;
      else store.profiles.push(profile);
      return snapshot();
    },
    deleteProfile: async (profileId) => {
      store.profiles = store.profiles.filter((item) => item.id !== profileId);
      return snapshot();
    },
    validateProfile: async () => ({
      ok: true,
      status: 200,
      elapsedMs: 312,
      models: [
        "grok-4",
        "grok-4.5",
        "grok-4.5-latest",
        "grok-build",
        "grok-build-latest",
      ],
      message: "连接成功，发现 5 个模型",
    }),
    applyProfile: async (profile) => {
      const index = store.profiles.findIndex((item) => item.id === profile.id);
      const saved = { ...profile, lastUsedAt: new Date().toISOString() };
      if (index >= 0) store.profiles[index] = saved;
      else store.profiles.push(saved);
      store.activeProfileId = profile.id;
      return { ok: true, message: "配置文件已保存并应用成功", snapshot: snapshot() };
    },
    restoreBackup: async () => ({
      ok: true,
      message: "已恢复上一份备份",
      snapshot: snapshot(),
    }),
    chooseConfigPath: async () => snapshot(),
    importProfiles: async () => ({
      imported: 1,
      skipped: 0,
      errors: [],
      snapshot: snapshot(),
    }),
    exportProfiles: async () => true,
  };
}
