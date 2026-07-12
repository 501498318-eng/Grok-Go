import { dialog, ipcMain } from "electron";
import path from "node:path";
import type { ProviderProfile } from "../shared/types.js";
import { ProfileService } from "./profile-service.js";

export function registerIpc(service: ProfileService): void {
  ipcMain.handle("grok:load-snapshot", () => service.snapshot());
  ipcMain.handle("grok:save-profile", (_event, profile: ProviderProfile) =>
    service.saveProfile(profile),
  );
  ipcMain.handle("grok:delete-profile", (_event, profileId: string) =>
    service.deleteProfile(profileId),
  );
  ipcMain.handle("grok:validate-profile", (_event, profile: ProviderProfile) =>
    service.validate(profile),
  );
  ipcMain.handle(
    "grok:apply-profile",
    (_event, profile: ProviderProfile, options) =>
      service.apply(profile, options),
  );
  ipcMain.handle("grok:restore-backup", (_event, expectedHash?: string) =>
    service.restore(expectedHash),
  );

  ipcMain.handle("grok:choose-config-path", async () => {
    const current = await service.snapshot();
    const result = await dialog.showOpenDialog({
      title: "选择 Grok config.toml",
      defaultPath: current.configPath,
      properties: ["openFile", "showHiddenFiles"],
      filters: [{ name: "TOML 配置", extensions: ["toml"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return service.setConfigPath(result.filePaths[0]);
  });

  ipcMain.handle("grok:import-profiles", async () => {
    const result = await dialog.showOpenDialog({
      title: "导入供应商档案",
      properties: ["openFile"],
      filters: [{ name: "JSON 档案", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return service.importData(result.filePaths[0]);
  });

  ipcMain.handle("grok:export-profiles", async () => {
    const result = await dialog.showSaveDialog({
      title: "导出供应商档案",
      defaultPath: path.join(
        process.env.USERPROFILE ?? process.cwd(),
        "grok-provider-profiles.json",
      ),
      filters: [{ name: "JSON 档案", extensions: ["json"] }],
    });
    if (result.canceled || !result.filePath) return false;
    await service.exportData(result.filePath);
    return true;
  });
}
