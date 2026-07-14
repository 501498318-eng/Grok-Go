import type { AppSnapshot, ProviderProfile } from "../../../shared/types";
import { hostFromBaseUrl, protocolCode } from "../../lib/profile-utils";

export function SpecBar({
  draft,
  snapshot,
  isActive,
  dirty,
}: {
  draft: ProviderProfile;
  snapshot: AppSnapshot;
  isActive: boolean;
  dirty: boolean;
}) {
  const upstream = draft.compatibilityProxy
    ? "127.0.0.1:8787"
    : hostFromBaseUrl(draft.baseUrl) || "—";
  const statusClass = dirty ? "dirty" : isActive ? "" : "idle";
  const statusLabel = dirty ? "Dirty" : isActive ? "Synced" : "Idle";

  return (
    <div className="specbar" aria-label="配置规格">
      <div className="spec-cell">
        <label>档案</label>
        <strong title={draft.name}>{draft.name || "未命名"}</strong>
      </div>
      <div className="spec-cell">
        <label>协议</label>
        <strong className="mono">{protocolCode(draft.protocol)}</strong>
      </div>
      <div className="spec-cell">
        <label>上游</label>
        <strong className="mono" title={draft.baseUrl}>
          {upstream}
        </strong>
      </div>
      <div className="spec-cell">
        <label>目标</label>
        <strong className="mono" title={snapshot.configPath}>
          {snapshot.configPath.includes(".grok")
            ? "~/.grok/config.toml"
            : snapshot.configPath.split(/[/\\]/).slice(-2).join("/")}
        </strong>
      </div>
      <div className={`spec-status ${statusClass}`.trim()}>
        <span>{statusLabel}</span>
      </div>
    </div>
  );
}
