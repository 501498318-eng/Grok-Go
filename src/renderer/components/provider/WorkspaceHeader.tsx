import { CheckCircle2, LoaderCircle } from "lucide-react";
import type { ProviderProfile } from "../../../shared/types";
import type { BusyAction } from "../../types";

export function WorkspaceHeader({
  draft,
  isActive,
  dirty,
  busy,
  onApply,
}: {
  draft: ProviderProfile;
  isActive: boolean;
  dirty: boolean;
  busy: BusyAction;
  onApply: () => void;
}) {
  return (
    <header className="workspace-header">
      <div className="header-identity">
        <h1 title={draft.name}>{draft.name || "未命名供应商"}</h1>
        <div className="header-badges">
          {isActive ? (
            <span className="badge badge-live">
              <span className="tab-dot" />
              当前生效
            </span>
          ) : (
            <span className="badge badge-idle">未应用</span>
          )}
          {dirty ? <span className="badge badge-dirty">未保存更改</span> : null}
        </div>
      </div>
      <div className="header-actions">
        <button className="primary-button" onClick={onApply} disabled={busy !== null}>
          {busy === "apply" ? (
            <LoaderCircle className="spin" size={16} />
          ) : (
            <CheckCircle2 size={16} />
          )}
          应用配置
        </button>
      </div>
    </header>
  );
}
