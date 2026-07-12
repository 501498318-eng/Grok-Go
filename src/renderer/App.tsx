import {
  Activity,
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Copy,
  Cpu,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FolderOpen,
  LoaderCircle,
  Plus,
  PlugZap,
  RotateCcw,
  Search,
  Server,
  Settings,
  SlidersHorizontal,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  AppSnapshot,
  ProviderProfile,
  ValidationResult,
} from "../shared/types";

const PROFILE_COLORS = ["#0ea5e9", "#0f172a", "#f59e0b", "#8b5cf6", "#10b981", "#f43f5e"];
const PANEL_MIN = 160;
const PANEL_MAX = 420;
const PANEL_DEFAULT = 248;

const PROTOCOL_OPTIONS: Array<{
  value: ProviderProfile["protocol"];
  label: string;
}> = [
  { value: "openai-responses", label: "OpenAI Responses" },
  { value: "openai-chat", label: "Chat Completions" },
  { value: "anthropic", label: "Anthropic Messages" },
];

function blankProfile(): ProviderProfile {
  return {
    id: crypto.randomUUID(),
    name: "新供应商",
    baseUrl: "https://",
    apiKey: "",
    protocol: "openai-responses",
    defaultModel: "",
    configuredModels: [],
    contextWindow: 256000,
    imageSupport: true,
    messagesFilterProxy: false,
  };
}

function configuredModelIds(profile: ProviderProfile): string[] {
  return [
    ...new Set(
      [profile.defaultModel, ...profile.configuredModels]
        .map((model) => model.trim())
        .filter(Boolean),
    ),
  ];
}

function formatDate(value?: string): string {
  if (!value) return "尚未使用";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function classifyTomlLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("[")) return "toml-section";
  if (trimmed.includes("=") && /".*"/.test(trimmed)) return "toml-string";
  if (trimmed.includes("=")) return "toml-key";
  return "";
}

function tomlPreview(profile: ProviderProfile): string[] {
  const escaped = (value: string) =>
    value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  const backend =
    profile.protocol === "anthropic"
      ? "messages"
      : profile.protocol === "openai-chat"
        ? "chat_completions"
        : "responses";
  const baseUrl =
    profile.protocol === "anthropic" && profile.messagesFilterProxy
      ? "http://127.0.0.1:8787/v1"
      : profile.baseUrl.replace(/\/+$/, "");
  const lines =
    profile.protocol === "anthropic"
      ? ["[models]"]
      : [
          "[endpoints]",
          `models_base_url = "${escaped(profile.baseUrl)}"`,
          `xai_api_base_url = "${escaped(profile.baseUrl)}"`,
          "",
          "[models]",
        ];
  lines.push(`default = "${escaped(profile.defaultModel)}"`);
  for (const modelId of configuredModelIds(profile)) {
    lines.push("", `[model."${escaped(modelId)}"]`);
    lines.push(`model = "${escaped(modelId)}"`);
    lines.push(`base_url = "${escaped(baseUrl)}"`);
    lines.push(`api_backend = "${backend}"`);
    if (profile.contextWindow) lines.push(`context_window = ${profile.contextWindow}`);
    lines.push('api_key = "••••••••••••••••"');
    if (profile.protocol === "anthropic") {
      lines.push(
        'extra_headers = { "x-api-key" = "••••••••••••••••", "anthropic-version" = "2023-06-01" }',
      );
    }
    if (modelId === profile.defaultModel && profile.imageSupport) {
      lines.push('input_modalities = ["text", "image"]');
      lines.push("supports_image_detail_original = true");
    }
  }
  return lines;
}

function Field({
  label,
  required = true,
  className = "",
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={`field ${className}`.trim()}>
      <span className="field-label">
        {label}
        {required ? <span className="req">*</span> : null}
      </span>
      <span className="field-control">{children}</span>
    </label>
  );
}

function ModelConfigurator({
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

function SettingsModal({
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
          <button
            className="icon-button"
            onClick={onClose}
            title="关闭"
            aria-label="关闭"
          >
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

export function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<ProviderProfile | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState<"validate" | "apply" | "restore" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<"diag" | "toml">("diag");
  const [panelHeight, setPanelHeight] = useState(PANEL_DEFAULT);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);

  const hydrate = useCallback(
    (next: AppSnapshot, preferredId?: string) => {
      setSnapshot(next);
      const id =
        preferredId ?? selectedId ?? next.activeProfileId ?? next.profiles[0]?.id ?? "";
      const selected =
        next.profiles.find((profile) => profile.id === id) ?? next.profiles[0];
      if (selected) {
        setSelectedId(selected.id);
        setDraft({ ...selected, configuredModels: [...selected.configuredModels] });
      }
    },
    [selectedId],
  );

  useEffect(() => {
    window.grokApi
      .loadSnapshot()
      .then((next) => hydrate(next))
      .catch((reason) => setError(String(reason)));
  }, []); // Initial Electron bridge hydration only.

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - event.clientY;
      const next = Math.min(
        PANEL_MAX,
        Math.max(PANEL_MIN, dragRef.current.startH + delta),
      );
      setPanelHeight(next);
      if (!panelOpen) setPanelOpen(true);
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [panelOpen]);

  const sourceProfile = snapshot?.profiles.find((profile) => profile.id === selectedId);
  const dirty = Boolean(
    draft && sourceProfile && JSON.stringify(draft) !== JSON.stringify(sourceProfile),
  );
  const previewLines = useMemo(() => (draft ? tomlPreview(draft) : []), [draft]);
  const filteredProfiles = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.profiles;
    return snapshot.profiles.filter(
      (profile) =>
        profile.name.toLowerCase().includes(needle) ||
        profile.baseUrl.toLowerCase().includes(needle) ||
        profile.defaultModel.toLowerCase().includes(needle),
    );
  }, [snapshot, query]);

  const update = <K extends keyof ProviderProfile>(
    key: K,
    value: ProviderProfile[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    if (key === "baseUrl" || key === "apiKey" || key === "protocol") {
      setValidation(null);
      setModelOptions([]);
    }
  };

  const updateDefaultModel = (defaultModel: string) => {
    setDraft((current) => {
      if (!current) return current;
      const configuredModels = [
        ...new Set(
          [defaultModel, ...current.configuredModels]
            .map((model) => model.trim())
            .filter(Boolean),
        ),
      ];
      return { ...current, defaultModel, configuredModels };
    });
  };

  const addConfiguredModel = (modelId: string) => {
    const normalized = modelId.trim();
    if (!normalized) return;
    setDraft((current) =>
      current
        ? {
            ...current,
            configuredModels: [...new Set([...current.configuredModels, normalized])],
          }
        : current,
    );
  };

  const removeConfiguredModel = (modelId: string) => {
    setDraft((current) => {
      if (!current || current.defaultModel === modelId) return current;
      return {
        ...current,
        configuredModels: current.configuredModels.filter((item) => item !== modelId),
      };
    });
  };

  const selectProfile = (id: string) => {
    if (dirty && !window.confirm("当前档案有未应用的修改，确定放弃吗？")) return;
    const selected = snapshot?.profiles.find((profile) => profile.id === id);
    if (!selected) return;
    setSelectedId(id);
    setDraft({ ...selected, configuredModels: [...selected.configuredModels] });
    setValidation(null);
    setModelOptions([]);
    setError("");
  };

  const addProfile = () => {
    if (dirty && !window.confirm("当前档案有未应用的修改，确定放弃吗？")) return;
    const created = blankProfile();
    setSelectedId(created.id);
    setDraft(created);
    setValidation(null);
    setModelOptions([]);
  };

  const openPanel = (tab: "diag" | "toml") => {
    setPanelTab(tab);
    setPanelOpen(true);
  };

  const testConnection = async (): Promise<ValidationResult | null> => {
    if (!draft) return null;
    setBusy("validate");
    setError("");
    openPanel("diag");
    try {
      const result = await window.grokApi.validateProfile(draft);
      setValidation(result);
      setModelOptions(result.models);
      if (result.ok) {
        const validated = { ...draft, lastValidatedAt: new Date().toISOString() };
        setDraft(validated);
        setToast(result.message);
      }
      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const apply = async () => {
    if (!draft || !snapshot) return;
    if (!validation?.ok) {
      const result = await testConnection();
      if (!result?.ok && !window.confirm("连接尚未验证成功，仍要强制应用此配置吗？")) {
        return;
      }
    }
    setBusy("apply");
    setError("");
    try {
      let result = await window.grokApi.applyProfile(draft, {
        expectedHash: snapshot.configHash,
      });
      if (
        result.conflict &&
        window.confirm("config.toml 已被其他程序修改。仍要覆盖吗？")
      ) {
        result = await window.grokApi.applyProfile(draft, { force: true });
      }
      hydrate(result.snapshot, draft.id);
      if (result.ok) setToast(`${result.message}，新 Grok 会话将使用此配置`);
      else setError(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    if (!snapshot || !window.confirm("恢复上一份备份？当前配置会成为新的备份。")) return;
    setBusy("restore");
    try {
      const result = await window.grokApi.restoreBackup(snapshot.configHash);
      hydrate(result.snapshot);
      if (result.ok) setToast(result.message);
      else setError(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!draft || !snapshot || !snapshot.profiles.some((item) => item.id === draft.id)) {
      return;
    }
    if (!window.confirm(`删除供应商“${draft.name}”？`)) return;
    try {
      const next = await window.grokApi.deleteProfile(draft.id);
      setSelectedId("");
      hydrate(next, next.profiles[0]?.id);
      setToast("供应商档案已删除");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const copyPreview = async () => {
    await navigator.clipboard.writeText(previewLines.join("\n"));
    setToast("TOML 预览已复制");
  };

  if (!snapshot || !draft) {
    return (
      <main className="loading-screen">
        <LoaderCircle className="spin" size={28} />
        <strong>正在读取 Grok 配置…</strong>
      </main>
    );
  }

  const isActive =
    snapshot.activeProfileId === draft.id && snapshot.activeMatchesConfig;
  const modelsEndpoint = `${draft.baseUrl.replace(/\/+$/, "")}/models`;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <img className="brand-mark" src="./icon.png" alt="" />
          <div className="brand-copy">
            <strong>Grok Go</strong>
            <span>第三方供应商档案</span>
          </div>
        </div>

        <div className="sidebar-toolbar">
          <label className="search-field">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索供应商…"
              aria-label="搜索供应商"
            />
          </label>
          <button
            className="icon-button solid"
            onClick={addProfile}
            title="新建供应商"
            aria-label="新建供应商"
          >
            <Plus size={18} />
          </button>
        </div>

        <nav className="profile-list" aria-label="供应商档案">
          {filteredProfiles.length === 0 ? (
            <div className="configured-model-empty" style={{ borderRadius: 8 }}>
              没有匹配的供应商
            </div>
          ) : (
            filteredProfiles.map((profile) => {
              const index = snapshot.profiles.findIndex((item) => item.id === profile.id);
              const active =
                snapshot.activeProfileId === profile.id && snapshot.activeMatchesConfig;
              const selected = selectedId === profile.id;
              return (
                <button
                  key={profile.id}
                  className={`profile-row ${selected ? "selected" : ""}`}
                  onClick={() => selectProfile(profile.id)}
                >
                  <span
                    className="profile-avatar"
                    style={{
                      background: PROFILE_COLORS[Math.max(0, index) % PROFILE_COLORS.length],
                    }}
                  >
                    {profile.name.trim().slice(0, 1).toUpperCase() || "?"}
                  </span>
                  <span className="profile-copy">
                    <strong>{profile.name}</strong>
                    <span className={active ? "active-copy" : ""}>
                      {active
                        ? "当前生效"
                        : `上次使用：${formatDate(profile.lastUsedAt)}`}
                    </span>
                  </span>
                  <span className={`profile-status ${active ? "live" : ""}`} />
                </button>
              );
            })
          )}
        </nav>

        <div className="sidebar-footer">
          <button
            className="ghost-button"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={15} />
            设置
          </button>
          <button
            className="ghost-button"
            onClick={() =>
              window.alert(
                "Grok Go v1.6.0\n轻量切换 Grok Build 的第三方供应商配置。",
              )
            }
          >
            <CircleHelp size={15} />
            关于
          </button>
        </div>
      </aside>

      <main className="workspace">
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
            <button
              className="secondary-button"
              onClick={testConnection}
              disabled={busy !== null}
            >
              {busy === "validate" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <PlugZap size={16} />
              )}
              测试连接
            </button>
            <button
              className="primary-button"
              onClick={apply}
              disabled={busy !== null}
            >
              {busy === "apply" ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <CheckCircle2 size={16} />
              )}
              应用配置
            </button>
          </div>
        </header>

        <div className="workspace-body">
          <div className="form-stack">
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
                      onChange={(event) => update("name", event.target.value)}
                    />
                  </Field>
                  <Field label="Base URL">
                    <input
                      className="mono"
                      value={draft.baseUrl}
                      onChange={(event) => update("baseUrl", event.target.value)}
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
                          onClick={() => update("protocol", option.value)}
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
                            update("messagesFilterProxy", event.target.checked)
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
                        onChange={(event) => update("apiKey", event.target.value)}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="field-icon"
                        onClick={() => setShowKey((value) => !value)}
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
                      onChange={(event) => updateDefaultModel(event.target.value)}
                      disabled={!configuredModelIds(draft).length}
                    >
                      {!draft.defaultModel ? (
                        <option value="">请先添加配置模型</option>
                      ) : null}
                      {configuredModelIds(draft).map((modelId) => (
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
                        update(
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
                        onChange={(event) => update("imageSupport", event.target.checked)}
                      />
                      <span className="toggle-track" aria-hidden="true">
                        <span />
                      </span>
                    </span>
                  </label>
                </div>
              </div>
            </section>

            <section className="form-section">
              <div className="form-section-head">
                <span className="section-icon">
                  <Cpu size={15} />
                </span>
                <h2>已配置模型</h2>
                <p>共 {configuredModelIds(draft).length} 个</p>
              </div>
              <div className="form-section-body">
                <ModelConfigurator
                  availableModels={modelOptions}
                  defaultModel={draft.defaultModel}
                  configuredModels={configuredModelIds(draft)}
                  onAdd={addConfiguredModel}
                  onRemove={removeConfiguredModel}
                />
              </div>
            </section>

            {error ? (
              <div className="error-banner" role="alert">
                <AlertTriangle size={16} />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="editor-meta-row">
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="secondary-button danger-button compact-button"
                  onClick={remove}
                  disabled={!snapshot.profiles.some((item) => item.id === draft.id)}
                  title="删除当前供应商"
                >
                  <Trash2 size={14} />
                  删除
                </button>
                <button
                  className="secondary-button compact-button"
                  onClick={restore}
                  disabled={!snapshot.backupExists || busy !== null}
                >
                  {busy === "restore" ? (
                    <LoaderCircle className="spin" size={14} />
                  ) : (
                    <RotateCcw size={14} />
                  )}
                  恢复备份
                </button>
              </div>
              <div style={{ display: "flex", gap: 8, color: "var(--text-muted)", fontSize: 12 }}>
                <span>{snapshot.backupExists ? "已有备份" : "暂无备份"}</span>
                <span>·</span>
                <button
                  type="button"
                  className="ghost-button compact-button"
                  onClick={() => openPanel("toml")}
                  style={{ height: 28 }}
                >
                  <FileCode2 size={14} />
                  查看 TOML
                </button>
              </div>
            </div>
          </div>
        </div>

        <section
          className={`bottom-panel ${panelOpen ? "" : "collapsed"}`}
          style={{ height: panelOpen ? panelHeight : "var(--bottom-tab-h)" }}
          aria-label="诊断与预览面板"
        >
          <div
            className={`panel-resizer ${dragRef.current ? "active" : ""}`}
            onMouseDown={(event) => {
              dragRef.current = { startY: event.clientY, startH: panelHeight };
              document.body.style.cursor = "row-resize";
              document.body.style.userSelect = "none";
              if (!panelOpen) setPanelOpen(true);
            }}
          />
          <div className="panel-tabs">
            <button
              type="button"
              className={`panel-tab ${panelTab === "diag" ? "active" : ""}`}
              onClick={() => openPanel("diag")}
            >
              <Activity size={14} />
              连接诊断
              {validation ? <span className="tab-dot" /> : null}
            </button>
            <button
              type="button"
              className={`panel-tab ${panelTab === "toml" ? "active" : ""}`}
              onClick={() => openPanel("toml")}
            >
              <FileCode2 size={14} />
              config.toml 预览
            </button>
            <div className="panel-tab-actions">
              <button
                type="button"
                className="icon-button"
                title={panelOpen ? "收起面板" : "展开面板"}
                aria-label={panelOpen ? "收起面板" : "展开面板"}
                onClick={() => setPanelOpen((value) => !value)}
              >
                {panelOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              </button>
            </div>
          </div>

          <div className="panel-body">
            {panelTab === "diag" ? (
              <div className="diag-view">
                {validation ? (
                  <>
                    <div
                      className={`diag-status-card ${validation.ok ? "ok" : "fail"}`}
                    >
                      <span className="diag-icon">
                        {validation.ok ? <Check size={22} /> : <X size={22} />}
                      </span>
                      <div className="diag-status-copy">
                        <strong>{validation.ok ? "连接成功" : "连接失败"}</strong>
                        <p>{validation.message}</p>
                      </div>
                    </div>
                    <div className="diag-grid">
                      <div className="diag-metric">
                        <label>请求地址</label>
                        <strong className="mono" title={modelsEndpoint}>
                          {modelsEndpoint}
                        </strong>
                      </div>
                      <div className="diag-metric">
                        <label>HTTP 状态</label>
                        <strong>
                          {validation.status != null ? validation.status : "—"}
                        </strong>
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
                  <div className="diag-empty">
                    <PlugZap size={28} strokeWidth={1.5} />
                    <p>点击「测试连接」验证地址、密钥和模型列表。结果会显示在这里。</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="toml-view">
                <div className="toml-toolbar">
                  <span>
                    预览将写入的配置片段 · {snapshot.configPath}
                  </span>
                  <button className="secondary-button compact-button" onClick={copyPreview}>
                    <Copy size={13} />
                    复制预览
                  </button>
                </div>
                <pre className="toml-preview">
                  {previewLines.map((line, index) => (
                    <span
                      className={classifyTomlLine(line)}
                      key={`${index}-${line}`}
                    >
                      <i>{index + 1}</i>
                      <code>{line || " "}</code>
                    </span>
                  ))}
                </pre>
              </div>
            )}
          </div>
        </section>
      </main>

      {settingsOpen ? (
        <SettingsModal
          snapshot={snapshot}
          onClose={() => setSettingsOpen(false)}
          onSnapshot={hydrate}
          onToast={setToast}
          onError={setError}
        />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
        </div>
      ) : null}
    </div>
  );
}
