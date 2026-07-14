import { CheckCircle2, LoaderCircle } from "lucide-react";
import { ConnectionDiagnostic } from "./components/diagnostics/ConnectionDiagnostic";
import { ProfileSidebar } from "./components/profiles/ProfileSidebar";
import { ProviderEditor } from "./components/provider/ProviderEditor";
import { SpecBar } from "./components/provider/SpecBar";
import { WorkspaceHeader } from "./components/provider/WorkspaceHeader";
import { SettingsModal } from "./components/settings/SettingsModal";
import { useProviderWorkspace } from "./hooks/useProviderWorkspace";

export function App() {
  const workspace = useProviderWorkspace();

  if (!workspace.snapshot || !workspace.draft) {
    return (
      <main className="loading-screen">
        <LoaderCircle className="spin" size={28} />
        <strong>正在读取 Grok 配置…</strong>
      </main>
    );
  }

  const { snapshot, draft } = workspace;
  return (
    <div className="app-shell">
      <div className="app-titlebar-drag" aria-hidden="true">
        <span>Grok Go</span>
      </div>
      <ProfileSidebar
        snapshot={snapshot}
        profiles={workspace.filteredProfiles}
        selectedId={workspace.selectedId}
        query={workspace.query}
        onQueryChange={workspace.setQuery}
        onAdd={workspace.addProfile}
        onSelect={workspace.selectProfile}
        onOpenSettings={() => workspace.setSettingsOpen(true)}
      />

      <main className="workspace">
        <WorkspaceHeader
          draft={draft}
          isActive={workspace.isActive}
          dirty={workspace.dirty}
          busy={workspace.busy}
          onApply={workspace.apply}
        />
        <SpecBar
          draft={draft}
          snapshot={snapshot}
          isActive={workspace.isActive}
          dirty={workspace.dirty}
        />
        <ProviderEditor
          snapshot={snapshot}
          draft={draft}
          busy={workspace.busy}
          error={workspace.error}
          showKey={workspace.showKey}
          modelOptions={workspace.modelOptions}
          previewLines={workspace.previewLines}
          onUpdate={workspace.update}
          onToggleKey={() => workspace.setShowKey((value) => !value)}
          onUpdateDefaultModel={workspace.updateDefaultModel}
          onAddConfiguredModel={workspace.addConfiguredModel}
          onRemoveConfiguredModel={workspace.removeConfiguredModel}
          onUpdateConfiguredModelSettings={workspace.updateConfiguredModelSettings}
          onTestConnection={workspace.testConnection}
          onRemove={workspace.remove}
          onRestore={workspace.restore}
          onCopyPreview={workspace.copyPreview}
        />
        <ConnectionDiagnostic
          open={workspace.diagnosticOpen}
          busy={workspace.busy}
          validation={workspace.validation}
          error={workspace.diagnosticError}
          modelsEndpoint={workspace.modelsEndpoint}
          onClose={() => workspace.setDiagnosticOpen(false)}
        />
      </main>

      {workspace.settingsOpen ? (
        <SettingsModal
          snapshot={snapshot}
          onClose={() => workspace.setSettingsOpen(false)}
          onSnapshot={workspace.hydrate}
          onToast={workspace.setToast}
          onError={workspace.setError}
        />
      ) : null}
      {workspace.toast ? (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {workspace.toast}
        </div>
      ) : null}
    </div>
  );
}
