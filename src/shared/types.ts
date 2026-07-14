export type ApiProtocol = "openai-responses" | "openai-chat" | "anthropic";

export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  protocol: ApiProtocol;
  messagesFilterProxy?: boolean;
  defaultModel: string;
  configuredModels: string[];
  contextWindow?: number;
  imageSupport: boolean;
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
