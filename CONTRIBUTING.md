# 参与贡献

感谢参与 Grok Go。

## 开发流程

1. Fork 或克隆仓库并创建功能分支。
2. 使用 Node.js 22 和 pnpm 10 运行 `pnpm install --frozen-lockfile`。
3. 修改完成后运行：

```powershell
pnpm test
pnpm run typecheck
pnpm run build
```

4. 提交 Pull Request，说明动机、行为变化和验证方法。

## 安全要求

- 不要提交真实 API Key、供应商档案、`config.toml`、日志或本机绝对路径。
- 测试与截图必须使用 `example.com` 和 `demo-key-not-real` 等虚构数据。
- 涉及 TOML 写入、备份或代理协议的修改必须补充测试。

## 代码约定

- 保持 Electron 主进程与渲染进程权限隔离。
- 文件和网络操作只放在主进程，通过受限 IPC 暴露。
- 不破坏已有 `profiles.json` 的 `schemaVersion: 1` 兼容性。
