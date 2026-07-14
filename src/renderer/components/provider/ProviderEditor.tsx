import { AlertTriangle, LoaderCircle, RotateCcw, Trash2 } from "lucide-react";
import type {
  AppSnapshot,
  ConfiguredModelSettings,
  ProviderProfile,
} from "../../../shared/types";
import type { BusyAction, ProfileUpdater } from "../../types";
import { TomlPreview } from "../config/TomlPreview";
import { BasicInfoSection } from "./BasicInfoSection";
import { ConfiguredModelsSection } from "./ConfiguredModelsSection";
import { ModelPreferencesSection } from "./ModelPreferencesSection";

export function ProviderEditor({
  snapshot,
  draft,
  busy,
  error,
  showKey,
  modelOptions,
  previewLines,
  onUpdate,
  onToggleKey,
  onUpdateDefaultModel,
  onAddConfiguredModel,
  onRemoveConfiguredModel,
  onUpdateConfiguredModelSettings,
  onTestConnection,
  onRemove,
  onRestore,
  onCopyPreview,
}: {
  snapshot: AppSnapshot;
  draft: ProviderProfile;
  busy: BusyAction;
  error: string;
  showKey: boolean;
  modelOptions: string[];
  previewLines: string[];
  onUpdate: ProfileUpdater;
  onToggleKey: () => void;
  onUpdateDefaultModel: (modelId: string) => void;
  onAddConfiguredModel: (modelId: string) => void;
  onRemoveConfiguredModel: (modelId: string) => void;
  onUpdateConfiguredModelSettings: (
    modelId: string,
    patch: Partial<ConfiguredModelSettings>,
  ) => void;
  onTestConnection: () => void;
  onRemove: () => void;
  onRestore: () => void;
  onCopyPreview: () => void;
}) {
  return (
    <div className="workspace-body">
      <div className="editor-layout">
        <div className="form-stack">
          <BasicInfoSection
            draft={draft}
            showKey={showKey}
            onToggleKey={onToggleKey}
            onUpdate={onUpdate}
          />
          <ModelPreferencesSection
            draft={draft}
            onUpdateDefaultModel={onUpdateDefaultModel}
          />
          <ConfiguredModelsSection
            draft={draft}
            busy={busy}
            availableModels={modelOptions}
            onTestConnection={onTestConnection}
            onAdd={onAddConfiguredModel}
            onRemove={onRemoveConfiguredModel}
            onUpdateSettings={onUpdateConfiguredModelSettings}
          />

          {error ? (
            <div className="error-banner" role="alert">
              <AlertTriangle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <div className="editor-meta-row">
            <div>
              <button
                className="secondary-button compact-button"
                onClick={onRestore}
                disabled={!snapshot.backupExists || busy !== null}
              >
                {busy === "restore" ? (
                  <LoaderCircle className="spin" size={14} />
                ) : (
                  <RotateCcw size={14} />
                )}
                恢复备份
              </button>
              <button
                className="secondary-button danger-button compact-button"
                onClick={onRemove}
                disabled={!snapshot.profiles.some((item) => item.id === draft.id)}
                title="删除当前供应商"
              >
                <Trash2 size={14} />
                删除档案
              </button>
            </div>
            <div className="backup-status">
              <span>
                {snapshot.backupExists
                  ? "Backup · config.toml.bak"
                  : "Backup · none"}
              </span>
            </div>
          </div>
        </div>

        <TomlPreview
          configPath={snapshot.configPath}
          lines={previewLines}
          onCopy={onCopyPreview}
        />
      </div>
    </div>
  );
}
