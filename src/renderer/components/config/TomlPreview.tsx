import { Copy } from "lucide-react";
import { classifyTomlLine } from "../../lib/profile-utils";

export function TomlPreview({
  configPath,
  lines,
  onCopy,
}: {
  configPath: string;
  lines: string[];
  onCopy: () => void;
}) {
  return (
    <aside className="toml-side-panel" aria-label="config.toml 预览">
      <div className="toml-side-head">
        <span className="section-icon dark" aria-hidden="true">
          T
        </span>
        <div>
          <h2>config.toml</h2>
          <p>Live preview</p>
        </div>
      </div>
      <div className="toml-toolbar">
        <span title={configPath}>{configPath}</span>
        <button className="secondary-button compact-button" onClick={onCopy}>
          <Copy size={13} />
          Copy
        </button>
      </div>
      <pre className="toml-preview">
        {lines.map((line, index) => (
          <span className={classifyTomlLine(line)} key={`${index}-${line}`}>
            <i>{index + 1}</i>
            <code>{line || " "}</code>
          </span>
        ))}
      </pre>
    </aside>
  );
}
