import { LoaderCircle, PlugZap } from "lucide-react";
import type {
  ConfiguredModelSettings,
  ProviderProfile,
} from "../../../shared/types";
import type { BusyAction } from "../../types";
import { configuredModelIds } from "../../lib/profile-utils";
import { ModelConfigurator } from "./ModelConfigurator";

export function ConfiguredModelsSection({
  draft,
  busy,
  availableModels,
  onTestConnection,
  onAdd,
  onRemove,
  onUpdateSettings,
}: {
  draft: ProviderProfile;
  busy: BusyAction;
  availableModels: string[];
  onTestConnection: () => void;
  onAdd: (modelId: string) => void;
  onRemove: (modelId: string) => void;
  onUpdateSettings: (
    modelId: string,
    patch: Partial<ConfiguredModelSettings>,
  ) => void;
}) {
  const models = configuredModelIds(draft);
  return (
    <section className="form-section">
      <div className="form-section-head">
        <span className="section-icon panel-index" aria-hidden="true">
          03
        </span>
        <h2>已配置模型</h2>
        <div className="section-head-actions">
          <span>{models.length} Models</span>
          <button
            className="secondary-button compact-button test-connection-button"
            onClick={onTestConnection}
            disabled={busy !== null}
          >
            {busy === "validate" ? (
              <LoaderCircle className="spin" size={15} />
            ) : (
              <PlugZap size={15} />
            )}
            测试连接
          </button>
        </div>
      </div>
      <div className="form-section-body">
        <ModelConfigurator
          availableModels={availableModels}
          defaultModel={draft.defaultModel}
          configuredModels={models}
          modelSettings={draft.modelSettings}
          onAdd={onAdd}
          onRemove={onRemove}
          onUpdateSettings={onUpdateSettings}
        />
      </div>
    </section>
  );
}
