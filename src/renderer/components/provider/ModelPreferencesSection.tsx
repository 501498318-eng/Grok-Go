import { ChevronDown } from "lucide-react";
import type { ProviderProfile } from "../../../shared/types";
import { configuredModelIds } from "../../lib/profile-utils";
import { Field } from "../ui/Field";

export function ModelPreferencesSection({
  draft,
  onUpdateDefaultModel,
}: {
  draft: ProviderProfile;
  onUpdateDefaultModel: (modelId: string) => void;
}) {
  const models = configuredModelIds(draft);
  return (
    <section className="form-section">
      <div className="form-section-head">
        <span className="section-icon panel-index" aria-hidden="true">
          02
        </span>
        <h2>模型偏好</h2>
        <p>Default Model</p>
      </div>
      <div className="form-section-body">
        <div className="form-grid">
          <Field label="默认模型" className="span-2">
            <select
              value={draft.defaultModel}
              onChange={(event) => onUpdateDefaultModel(event.target.value)}
              disabled={!models.length}
            >
              {!draft.defaultModel ? (
                <option value="">请先添加配置模型</option>
              ) : null}
              {models.map((modelId) => (
                <option key={modelId} value={modelId}>
                  {modelId}
                </option>
              ))}
            </select>
            <ChevronDown className="select-chevron" size={16} />
          </Field>
        </div>
      </div>
    </section>
  );
}
