import { ChevronDown, X } from "lucide-react";

export function ModelConfigurator({
  availableModels,
  defaultModel,
  configuredModels,
  onAdd,
  onRemove,
}: {
  availableModels: string[];
  defaultModel: string;
  configuredModels: string[];
  onAdd: (modelId: string) => void;
  onRemove: (modelId: string) => void;
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
            return (
              <div className="configured-model-row" key={modelId}>
                <span className="configured-model-name">{modelId}</span>
                {isDefault ? <span className="default-model-label">默认</span> : <span />}
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
