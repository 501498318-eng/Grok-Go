import { Eye, EyeOff, Server } from "lucide-react";
import type { ProviderProfile } from "../../../shared/types";
import type { ProfileUpdater } from "../../types";
import { Field } from "../ui/Field";

const PROTOCOL_OPTIONS: Array<{
  value: ProviderProfile["protocol"];
  label: string;
}> = [
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "openai-chat", label: "Chat Completions" },
  { value: "anthropic", label: "Anthropic Messages" },
];

export function BasicInfoSection({
  draft,
  showKey,
  onToggleKey,
  onUpdate,
}: {
  draft: ProviderProfile;
  showKey: boolean;
  onToggleKey: () => void;
  onUpdate: ProfileUpdater;
}) {
  return (
    <section className="form-section">
      <div className="form-section-head">
        <span className="section-icon">
          <Server size={15} />
        </span>
        <h2>基本信息</h2>
        <p>供应商接入地址与鉴权</p>
      </div>
      <div className="form-section-body">
        <div className="form-grid">
          <Field label="供应商名称">
            <input
              value={draft.name}
              onChange={(event) => onUpdate("name", event.target.value)}
            />
          </Field>
          <Field label="Base URL">
            <input
              className="mono"
              value={draft.baseUrl}
              onChange={(event) => onUpdate("baseUrl", event.target.value)}
              spellCheck={false}
            />
          </Field>
          <div className="field span-2">
            <span className="field-label">
              接口协议
              <span className="req">*</span>
            </span>
            <div className="protocol-grid" role="radiogroup" aria-label="接口协议">
              {PROTOCOL_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.protocol === option.value}
                  className={`protocol-option ${draft.protocol === option.value ? "active" : ""}`}
                  onClick={() => onUpdate("protocol", option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          {draft.protocol === "anthropic" ? (
            <label className="toggle-card span-2">
              <span className="toggle-card-copy">
                <strong>过滤不兼容的 thinking</strong>
                <span>
                  启动 127.0.0.1:8787 代理，过滤缺少 signature 的 thinking 块
                </span>
              </span>
              <span className="toggle-row">
                <input
                  type="checkbox"
                  role="switch"
                  checked={draft.messagesFilterProxy === true}
                  onChange={(event) =>
                    onUpdate("messagesFilterProxy", event.target.checked)
                  }
                />
                <span className="toggle-track" aria-hidden="true">
                  <span />
                </span>
              </span>
            </label>
          ) : null}
          <label className="field span-2">
            <span className="field-label">
              API Key
              <span className="req">*</span>
            </span>
            <span className="field-control has-icon">
              <input
                type={showKey ? "text" : "password"}
                value={draft.apiKey}
                onChange={(event) => onUpdate("apiKey", event.target.value)}
                spellCheck={false}
              />
              <button
                type="button"
                className="field-icon"
                onClick={onToggleKey}
                title={showKey ? "隐藏 API Key" : "显示 API Key"}
                aria-label={showKey ? "隐藏 API Key" : "显示 API Key"}
              >
                {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
