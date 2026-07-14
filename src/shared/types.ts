export type ApiProtocol = "openai-responses" | "openai-chat" | "anthropic";

export interface ConfiguredModelSettings {
  contextWindow: number;
  supportsReasoningEffort: boolean;
}

export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: ApiProtocol;
  compatibilityProxy?: boolean;
  defaultModel: string;
  configuredModels: string[];
  modelSettings: Record<string, ConfiguredModelSettings>;
  /** Legacy profile field retained for schemaVersion 1 migration. */
  contextWindow?: number;
  /** Legacy field; Grok Build 0.2.101 no longer accepts its TOML overrides. */
  imageSupport?: boolean;
  lastValidatedAt?: string;
  lastUsedAt?: string;
}

export interface ProfileStore {
  schemaVersion: 1;
  configPath: string;
  activeProfileId?: string;
  profiles: ProviderProfile[];
}

export interface AppSnapshot extends ProfileStore {
  configExists: boolean;
  backupExists: boolean;
  configText: string;
  configHash?: string;
  activeMatchesConfig: boolean;
}

export interface ValidationResult {
  ok: boolean;
  status?: number;
  elapsedMs: number;
  models: string[];
  message: string;
}

export interface ApplyOptions {
  expectedHash?: string | null;
  force?: boolean;
}

export interface ApplyResult {
  ok: boolean;
  conflict?: boolean;
  message: string;
  snapshot: AppSnapshot;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
  snapshot: AppSnapshot;
}

export interface GrokApi {
  loadSnapshot(): Promise<AppSnapshot>;
  saveProfile(profile: ProviderProfile): Promise<AppSnapshot>;
  deleteProfile(profileId: string): Promise<AppSnapshot>;
  validateProfile(profile: ProviderProfile): Promise<ValidationResult>;
  applyProfile(profile: ProviderProfile, options: ApplyOptions): Promise<ApplyResult>;
  restoreBackup(expectedHash?: string): Promise<ApplyResult>;
  chooseConfigPath(): Promise<AppSnapshot | null>;
  importProfiles(): Promise<ImportResult | null>;
  exportProfiles(): Promise<boolean>;
}

declare global {
  interface Window {
    grokApi: GrokApi;
  }
}
