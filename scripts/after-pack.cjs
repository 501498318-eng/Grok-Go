const path = require("node:path");

module.exports = async function stampWindowsExecutable(context) {
  if (context.electronPlatformName !== "win32") return;

  const { rcedit } = await import("rcedit");
  const appInfo = context.packager.appInfo;
  const executablePath = path.join(
    context.appOutDir,
    `${appInfo.productFilename}.exe`,
  );

  await rcedit(executablePath, {
    "file-version": appInfo.version,
    "product-version": appInfo.version,
    "version-string": {
      CompanyName: "501498318-eng",
      FileDescription: "Grok Go - Grok Build 第三方供应商配置切换器",
      InternalName: "Grok Go",
      LegalCopyright: "Copyright (c) 2026 501498318-eng",
      OriginalFilename: "Grok Go.exe",
      ProductName: "Grok Go",
    },
    icon: path.resolve(context.packager.projectDir, "assets", "icon.ico"),
    "requested-execution-level": "asInvoker",
  });
};
