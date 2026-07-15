<p align="center">
  <img src="assets/icon.png" width="96" height="96" alt="Grok Go 图标">
</p>

<h1 align="center">Grok Go</h1>

<p align="center">
  面向 Windows 的 Grok Build 第三方供应商配置切换器
</p>

<p align="center">
  <a href="https://github.com/501498318-eng/Grok-Go/releases/latest"><img src="https://img.shields.io/github/v/release/501498318-eng/Grok-Go?label=release" alt="最新版本"></a>
  <a href="https://github.com/501498318-eng/Grok-Go/actions/workflows/ci.yml"><img src="https://github.com/501498318-eng/Grok-Go/actions/workflows/ci.yml/badge.svg" alt="CI 状态"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/501498318-eng/Grok-Go" alt="MIT 许可证"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20x64-0078D4" alt="Windows x64">
</p>

Grok Go 用于保存多个第三方供应商档案，并按所选协议生成 Grok Build 使用的 `~/.grok/config.toml`。它提供逐模型配置、写入前备份、外部修改检测和针对已知流事件问题的可选本地兼容代理。

> [!IMPORTANT]
> Grok Go 是社区项目，与 xAI 没有隶属或背书关系。协议选择只会生成相应的 Grok Build 配置，不会在 OpenAI 与 Anthropic 协议之间进行通用转换；供应商必须原生兼容所选接口。

![Grok Go 主界面](docs/screenshot.png)

## 下载与安装

前往 [Latest Release](https://github.com/501498318-eng/Grok-Go/releases/latest) 下载适合的 Windows x64 版本：

| 文件 | 适用场景 |
| --- | --- |
| `Grok-Go-<版本>-Setup-x64.exe` | 推荐。通过安装向导安装，并创建桌面和开始菜单快捷方式。安装新版时会保留现有供应商档案。 |
| `Grok-Go-<版本>-win-x64.zip` | 免安装。完整解压后运行其中的 `Grok Go.exe`，不要只复制单独的 EXE。 |
| `SHA256SUMS.txt` | 用于核对下载文件的 SHA-256。 |

当前安装包尚未进行代码签名，因此 Windows 可能显示“未知发布者”。请只从本仓库的 Release 页面下载，并在需要时核对 SHA-256。

## 快速上手

1. 新建或选择一个供应商档案。
2. 填写供应商名称、Base URL 和 API Key。
3. 选择供应商实际支持的接口协议。
4. 点击“测试连接”读取模型列表，或手动添加模型。
5. 为每个模型设置上下文窗口和 reasoning effort 能力，并选择默认模型。
6. 点击“应用配置”，然后重新启动 Grok 会话。

首次启动时，如果档案文件尚不存在，Grok Go 会尝试将现有的 `%USERPROFILE%\.grok\config.toml` 导入为“当前配置”；无法导入时会创建一个空白档案。配置切换只影响之后启动的新 Grok 会话。

## 核心功能

- 管理、搜索、删除以及 JSON 导入导出多个供应商档案；同名档案导入时自动创建副本。
- 生成 OpenAI Responses、OpenAI Chat Completions 或 Anthropic Messages 对应的 Grok Build 模型配置。
- 从供应商模型列表接口读取模型 ID，也允许手动添加和移除模型。
- 为每个模型独立设置上下文窗口、reasoning effort 能力和默认模型。
- 保留配置文件中的其他公共设置，写入前备份，并通过原子替换减少写坏文件的风险。
- 检测 `config.toml` 被其他程序修改的情况，覆盖前要求明确确认。
- 通过本地兼容代理处理两类已确认的 Responses 和 Messages 流事件问题。
- 在设置中更改 Grok 配置路径，以及导入或导出版本化档案 JSON。

## 协议与测试连接

| 界面选项 | 写入的 `api_backend` | 测试连接鉴权 | 兼容模式 |
| --- | --- | --- | --- |
| OpenAI Responses | `responses` | `Authorization: Bearer ...` | 可用 |
| Chat Completions | `chat_completions` | `Authorization: Bearer ...` | 不可用 |
| Anthropic Messages | `messages` | `x-api-key` 与 `anthropic-version` | 可用 |

“测试连接”会向 `{Base URL}/models` 发起请求，超时时间为 15 秒，并读取 OpenAI 风格的 `data[].id` 模型列表。它只能确认模型列表接口在当前鉴权下可访问，**不能证明**以下能力可用：

- 对话或流式响应；
- 工具调用；
- reasoning effort；
- 图片输入；
- 所有返回模型均可实际调用。

部分 Anthropic 兼容供应商不提供模型列表接口。遇到 HTTP 404 时，可以手动添加模型并在确认供应商信息无误后强制应用。

## 模型设置

Grok Go 会为每个已配置模型写入独立的 `context_window` 和 `supports_reasoning_effort`：

- 新增的 `grok-4.5*` 模型默认使用 `500000` 上下文窗口。
- 其他模型默认使用 `200000`，两者都可以逐项修改。
- reasoning 开关只负责写入 `supports_reasoning_effort = true/false`，不会探测或改造上游能力。
- 只有确认供应商与模型接受 reasoning effort 参数时才应开启该开关。
- `reasoning` 不是 `input_modalities` 字段的可选值；Grok Go 不会通过图片能力字段声明推理支持。

模型列表接口通常只返回模型 ID，无法可靠声明模型能力。即使测试连接成功，错误开启 reasoning 仍可能导致 Grok Build 提示 `current model does not support reasoning effort`。

## 协议兼容模式

部分第三方接口会返回 Grok Build 无法解析的流事件。为对应档案开启“协议兼容模式”后，Grok Go 会在 `127.0.0.1:8787` 启动本地代理，并将已配置模型的 `base_url` 指向 `http://127.0.0.1:8787/v1`。

代理只应用以下精确规则：

- **Anthropic Messages：**过滤响应中的 `thinking` 内容块，重新映射剩余内容块索引，并保留 `tool_use`、工具名和 `input_json_delta` 等工具调用事件。
- **OpenAI Responses：**只过滤缺少 `sequence_number`、内容为空且标记为 synthetic first token 的 `response.output_text.delta` 首帧；其他事件与合法序号保持原样。

兼容模式不是协议转换器，也不会补造工具名、调用 ID、参数或事件序号。它不能修复鉴权失败、模型不存在、事件乱序、上游中断或其他未知格式问题。

兼容模式启用期间，关闭主窗口会让 Grok Go 驻留系统托盘，以保持代理运行。要彻底退出，请在托盘菜单中选择“退出并停止本地代理”。

## 配置、备份与恢复

- 默认配置路径：`%USERPROFILE%\.grok\config.toml`，可在设置中选择其他路径。
- 每次应用配置时，如果当前文件存在，会覆盖生成一份 `config.toml.bak`；程序只维护这一份最近备份，不保存历史备份列表。
- “恢复备份”会交换当前配置与 `.bak` 的内容，因此恢复前的配置仍可再次换回。
- 写入使用临时文件原子替换，并在应用或恢复前检查外部修改，避免静默覆盖其他程序刚写入的内容。
- 应用配置后，如果 VS Code、Cursor 或 Windsurf 的用户设置中已经存在 `grok.defaultModel`，Grok Go 会将其同步为当前默认模型；它不会主动创建这个设置。

## 数据与安全

供应商档案保存在：

```text
%APPDATA%\grok-config-switcher\profiles.json
```

API Key 会按用户选择以明文保存在档案文件和 Grok 配置中，导出的 JSON 也包含明文 API Key。请勿将 `profiles.json`、导出 JSON、`config.toml`、日志或截图中的真实供应商信息上传到 GitHub、网盘或公开聊天。

本仓库及其 Release 构建不包含用户档案、真实 API Key、`config.toml` 或备份文件。安全问题请参阅 [SECURITY.md](SECURITY.md)。

## 常见问题

### 测试连接成功，但对话或工具调用失败

测试连接没有调用推理接口，也不检查流事件。请先确认协议选择与供应商文档一致，再检查实际响应格式。只有错误符合上述两条精确规则时才应开启兼容模式；其他兼容问题通常需要供应商修复。

### Anthropic 模式无法读取模型列表

部分供应商没有实现 `/models`。确认 Base URL、模型 ID 和 API Key 后，可以手动添加模型并强制应用。

### Grok 提示模型不支持 reasoning effort

关闭该模型右侧的 reasoning 开关，或向供应商确认模型是否接受 reasoning effort 参数。向 `input_modalities` 添加 `reasoning` 不能解决此问题。

### 关闭窗口后程序仍在运行

启用兼容模式时这是预期行为。程序需要驻留托盘以维持本地代理；通过托盘菜单可以完全退出。

## 本地开发

环境要求：Node.js 22、pnpm 10、Windows。

```powershell
pnpm install --frozen-lockfile
pnpm dev
```

测试和构建：

```powershell
pnpm test
pnpm run typecheck
pnpm run build
pnpm run dist
```

GitHub Actions 会在 Windows 环境中执行依赖安装、类型检查、单元测试和生产构建。参与开发前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

Grok Go 采用 [MIT License](LICENSE) 发布。
