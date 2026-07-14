import { BrainCircuit, ChevronDown, X } from "lucide-react";
import { defaultConfiguredModelSettings } from "../../../shared/model-settings";
import type { ConfiguredModelSettings } from "../../../shared/types";

export function ModelConfigurator({
  availableModels,
  defaultModel,
  configuredModels,
  modelSettings,
  onAdd,
  onRemove,
  onUpdateSettings,
}: {
  availableModels: string[];
  defaultModel: string;
  configuredModels: string[];
  modelSettings: Record<string, ConfiguredModelSettings>;
  onAdd: (modelId: string) => void;
  onRemove: (modelId: string) => void;
  onUpdateSettings: (
    modelId: string,
    patch: Partial<ConfiguredModelSettings>,
  ) => void;
}) {
  const selected = new Set(configuredModels);
  const addable = availableModels.filter((modelId) => !selected.has(modelId));
  return (
    <div className="model-configurator">
      <div className="model-select-wrap">
        <select
          value=""
          onChange={(event) => {
            onAdd(event.target.value);
            event.target.value = "";
          }}
          disabled={!addable.length}
          aria-label="添加配置模型"
        >
          <option value="">
            {availableModels.length
              ? "选择上游模型并添加"
              : "测试连接后读取上游模型"}
          </option>
          {addable.map((modelId) => (
            <option key={modelId} value={modelId}>
              {modelId}
            </option>
          ))}
        </select>
        <ChevronDown className="select-chevron" size={16} />
      </div>
      <div className="configured-model-list">
        {configuredModels.length === 0 ? (
          <div className="configured-model-empty">
            尚未添加模型。测试连接后可从上游列表选择，或先填写默认模型。
          </div>
        ) : (
          configuredModels.map((modelId) => {
            const isDefault = modelId === defaultModel;
            const settings =
              modelSettings[modelId] ?? defaultConfiguredModelSettings(modelId);
            return (
              <div className="configured-model-row" key={modelId}>
                <span className="configured-model-name" title={modelId}>{modelId}</span>
                <label
                  className="model-context-control"
                  title={`${modelId} 的上下文窗口`}
                >
                  <span>ctx</span>
                  <input
                    type="number"
                    min="1"
                    step="1000"
                    value={settings.contextWindow}
                    aria-label={`${modelId} 上下文窗口`}
                    onChange={(event) =>
                      onUpdateSettings(modelId, {
                        contextWindow: Number(event.target.value),
                      })
                    }
                    onBlur={() => {
                      if (settings.contextWindow <= 0) {
                        onUpdateSettings(
                          modelId,
                          {
                            contextWindow:
                              defaultConfiguredModelSettings(modelId).contextWindow,
                          },
                        );
                      }
                    }}
                  />
                </label>
                <button
                  type="button"
                  className={`model-capability-toggle ${settings.supportsReasoningEffort ? "active" : ""}`}
                  aria-pressed={settings.supportsReasoningEffort}
                  aria-label={`${modelId} 推理强度支持`}
                  title={
                    settings.supportsReasoningEffort
                      ? "已声明支持推理强度；点击关闭"
                      : "声明此模型支持 reasoning effort（仅在上游实际支持时开启）"
                  }
                  onClick={() =>
                    onUpdateSettings(modelId, {
                      supportsReasoningEffort: !settings.supportsReasoningEffort,
                    })
                  }
                >
                  <BrainCircuit size={15} />
                </button>
                <span className="default-model-slot">
                  {isDefault ? <span className="default-model-label">默认</span> : null}
                </span>
                <button
                  type="button"
                  className="model-remove-button"
                  onClick={() => onRemove(modelId)}
                  disabled={isDefault}
                  title={isDefault ? "请先更换默认模型" : `取消配置 ${modelId}`}
                  aria-label={
                    isDefault ? `${modelId} 是默认模型` : `取消配置 ${modelId}`
                  }
                >
                  <X size={15} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
