import { AlertTriangle, Download, FolderOpen, Upload, X } from "lucide-react";
import type { AppSnapshot } from "../../../shared/types";

export function SettingsModal({
  snapshot,
  onClose,
  onSnapshot,
  onToast,
  onError,
}: {
  snapshot: AppSnapshot;
  onClose: () => void;
  onSnapshot: (snapshot: AppSnapshot) => void;
  onToast: (message: string) => void;
  onError: (message: string) => void;
}) {
  const choosePath = async () => {
    try {
      const next = await window.grokApi.chooseConfigPath();
      if (next) onSnapshot(next);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const importProfiles = async () => {
    try {
      const result = await window.grokApi.importProfiles();
      if (!result) return;
      onSnapshot(result.snapshot);
      onToast(
        `已导入 ${result.imported} 个档案${result.skipped ? `，跳过 ${result.skipped} 个` : ""}`,
      );
      if (result.errors.length) onError(result.errors.join("\n"));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  const exportProfiles = async () => {
    if (!window.confirm("导出的 JSON 包含明文 API Key。确认继续导出吗？")) return;
    try {
      if (await window.grokApi.exportProfiles()) onToast("档案已导出");
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="settings-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="settings-title">设置</h2>
          <button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭">
            <X size={18} />
          </button>
        </header>
        <div className="settings-body">
          <div>
            <label className="settings-label">Grok 配置文件</label>
            <div className="path-picker">
              <input value={snapshot.configPath} readOnly />
              <button
                className="icon-button"
                onClick={choosePath}
                title="选择配置文件"
                aria-label="选择配置文件"
              >
                <FolderOpen size={18} />
              </button>
            </div>
          </div>
          <div>
            <label className="settings-label">档案数据</label>
            <div className="settings-actions">
              <button className="secondary-button" onClick={importProfiles}>
                <Upload size={16} />
                导入 JSON
              </button>
              <button className="secondary-button" onClick={exportProfiles}>
                <Download size={16} />
                导出 JSON
              </button>
            </div>
          </div>
          <div className="warning-box">
            <AlertTriangle size={16} />
            <span>
              导出的 JSON 包含明文 API Key，请勿上传到公开仓库或分享给不可信对象。
            </span>
          </div>
          <p className="helper-copy">
            导入同名档案时会自动创建副本，不会覆盖现有供应商。
          </p>
        </div>
        <footer>
          <button className="secondary-button" onClick={onClose}>
            关闭
          </button>
        </footer>
      </section>
    </div>
  );
}
