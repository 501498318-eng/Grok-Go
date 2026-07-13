import { Cpu, LoaderCircle, PlugZap } from "lucide-react";
import type { ProviderProfile } from "../../../shared/types";
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
}: {
  draft: ProviderProfile;
  busy: BusyAction;
  availableModels: string[];
  onTestConnection: () => void;
  onAdd: (modelId: string) => void;
  onRemove: (modelId: string) => void;
}) {
  const models = configuredModelIds(draft);
  return (
    <section className="form-section">
      <div className="form-section-head">
        <span className="section-icon">
          <Cpu size={15} />
        </span>
        <h2>已配置模型</h2>
        <div className="section-head-actions">
          <span>共 {models.length} 个</span>
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
          onAdd={onAdd}
          onRemove={onRemove}
        />
      </div>
    </section>
  );
}
