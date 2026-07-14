import { Check, LoaderCircle, X } from "lucide-react";
import type { ValidationResult } from "../../../shared/types";
import type { BusyAction } from "../../types";

export function ConnectionDiagnostic({
  open,
  busy,
  validation,
  error,
  modelsEndpoint,
  onClose,
}: {
  open: boolean;
  busy: BusyAction;
  validation: ValidationResult | null;
  error: string;
  modelsEndpoint: string;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <section className="diagnostic-popover" role="status" aria-live="polite">
      <button
        type="button"
        className="diagnostic-close"
        onClick={onClose}
        title="关闭连接诊断"
        aria-label="关闭连接诊断"
      >
        <X size={16} />
      </button>
      {busy === "validate" ? (
        <div className="diagnostic-loading">
          <span className="diag-icon loading">
            <LoaderCircle className="spin" size={22} />
          </span>
          <div className="diag-status-copy">
            <strong>正在测试连接</strong>
            <p className="mono" title={modelsEndpoint}>{modelsEndpoint}</p>
          </div>
        </div>
      ) : validation ? (
        <>
          <div className={`diag-status-card ${validation.ok ? "ok" : "fail"}`}>
            <span className="diag-icon">
              {validation.ok ? <Check size={22} /> : <X size={22} />}
            </span>
            <div className="diag-status-copy">
              <strong>{validation.ok ? "连接成功" : "连接失败"}</strong>
              <p>{validation.message}</p>
            </div>
          </div>
          <div className="diag-grid">
            <div className="diag-metric endpoint">
              <label>请求地址</label>
              <strong className="mono" title={modelsEndpoint}>{modelsEndpoint}</strong>
            </div>
            <div className="diag-metric">
              <label>HTTP 状态</label>
              <strong>{validation.status != null ? validation.status : "—"}</strong>
            </div>
            <div className="diag-metric">
              <label>响应耗时</label>
              <strong>{validation.elapsedMs} ms</strong>
            </div>
            <div className="diag-metric">
              <label>发现模型</label>
              <strong>{validation.models.length}</strong>
            </div>
          </div>
        </>
      ) : (
        <div className="diag-status-card fail">
          <span className="diag-icon"><X size={22} /></span>
          <div className="diag-status-copy">
            <strong>连接失败</strong>
            <p>{error || "未能完成连接测试"}</p>
          </div>
        </div>
      )}
    </section>
  );
}
