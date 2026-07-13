import { ChevronDown, SlidersHorizontal } from "lucide-react";
import type { ProviderProfile } from "../../../shared/types";
import type { ProfileUpdater } from "../../types";
import { configuredModelIds } from "../../lib/profile-utils";
import { Field } from "../ui/Field";

export function ModelPreferencesSection({
  draft,
  onUpdate,
  onUpdateDefaultModel,
}: {
  draft: ProviderProfile;
  onUpdate: ProfileUpdater;
  onUpdateDefaultModel: (modelId: string) => void;
}) {
  const models = configuredModelIds(draft);
  return (
    <section className="form-section">
      <div className="form-section-head">
        <span className="section-icon">
          <SlidersHorizontal size={15} />
        </span>
        <h2>模型偏好</h2>
        <p>默认模型与能力开关</p>
      </div>
      <div className="form-section-body">
        <div className="form-grid">
          <Field label="默认模型">
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
          <Field label="上下文窗口">
            <input
              type="number"
              min="1"
              step="1000"
              value={draft.contextWindow ?? ""}
              onChange={(event) =>
                onUpdate(
                  "contextWindow",
                  event.target.value ? Number(event.target.value) : undefined,
                )
              }
            />
          </Field>
          <label className="toggle-card span-2">
            <span className="toggle-card-copy">
              <strong>图片能力</strong>
              <span>为默认模型写入 image 输入能力声明</span>
            </span>
            <span className="toggle-row">
              <input
                type="checkbox"
                role="switch"
                checked={draft.imageSupport}
                onChange={(event) => onUpdate("imageSupport", event.target.checked)}
              />
              <span className="toggle-track" aria-hidden="true">
                <span />
              </span>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
