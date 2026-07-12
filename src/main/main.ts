import { app, BrowserWindow, Menu, shell, Tray } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { registerIpc } from "./ipc.js";
import { ProfileService } from "./profile-service.js";
import { MessagesFilterProxy } from "./messages-filter-proxy.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const messagesProxy = new MessagesFilterProxy();
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;

function showMainWindow(): void {
  if (mainWindow) mainWindow.show();
  else createWindow();
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    backgroundColor: "#ffffff",
    icon: path.join(app.getAppPath(), "assets", "icon.png"),
    title: "Grok Go",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) void window.loadURL(devUrl);
  else void window.loadFile(path.join(__dirname, "../../dist/index.html"));
  window.on("close", (event) => {
    if (!quitting && messagesProxy.running) {
      event.preventDefault();
      window.hide();
    }
  });
  window.on("closed", () => {
    if (mainWindow === window) mainWindow = undefined;
  });
  mainWindow = window;
  return window;
}

app.whenReady().then(() => {
  const userDataPath = process.env.GROK_SWITCHER_USER_DATA ?? app.getPath("userData");
  const configPath = process.env.GROK_SWITCHER_CONFIG_PATH ??
    path.join(app.getPath("home"), ".grok", "config.toml");
  const service = new ProfileService(
    userDataPath,
    configPath,
    process.env.APPDATA,
    messagesProxy,
  );
  registerIpc(service);
  createWindow();
  tray = new Tray(path.join(app.getAppPath(), "assets", "icon.png"));
  tray.setToolTip("Grok Go");
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "打开 Grok Go", click: showMainWindow },
    { type: "separator" },
    { label: "退出并停止本地代理", click: () => app.quit() },
  ]));
  tray.on("double-click", showMainWindow);
  void service.syncActiveProxy().catch((error) =>
    console.error("Messages proxy startup failed", error),
  );
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !messagesProxy.running) app.quit();
});

app.on("before-quit", () => {
  quitting = true;
  void messagesProxy.stop();
  tray?.destroy();
  tray = undefined;
});
