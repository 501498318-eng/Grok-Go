import { contextBridge, ipcRenderer } from "electron";
import type { GrokApi } from "../shared/types.js" with { "resolution-mode": "import" };

const api: GrokApi = {
  loadSnapshot: () => ipcRenderer.invoke("grok:load-snapshot"),
  saveProfile: (profile) => ipcRenderer.invoke("grok:save-profile", profile),
  deleteProfile: (profileId) =>
    ipcRenderer.invoke("grok:delete-profile", profileId),
  validateProfile: (profile) =>
    ipcRenderer.invoke("grok:validate-profile", profile),
  applyProfile: (profile, options) =>
    ipcRenderer.invoke("grok:apply-profile", profile, options),
  restoreBackup: (expectedHash) =>
    ipcRenderer.invoke("grok:restore-backup", expectedHash),
  chooseConfigPath: () => ipcRenderer.invoke("grok:choose-config-path"),
  importProfiles: () => ipcRenderer.invoke("grok:import-profiles"),
  exportProfiles: () => ipcRenderer.invoke("grok:export-profiles"),
};

contextBridge.exposeInMainWorld("grokApi", api);
