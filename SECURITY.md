# 安全策略

## 支持版本

当前仅维护最新发布版本。

## 报告安全问题

请不要在公开 Issue 中提交 API Key、供应商地址、配置文件或漏洞利用细节。请通过 GitHub 仓库的 **Security → Report a vulnerability** 创建私密安全报告。

报告时请提供受影响版本、复现步骤、预期行为和已隐藏密钥及个人路径的日志。

## 本地密钥存储

Grok Go 按用户选择将 API Key 明文保存在 `%APPDATA%\grok-config-switcher\profiles.json`，并写入 Grok 的 `config.toml`。请妥善保护 Windows 账户和这些文件，不要将档案 JSON 上传到 GitHub。
