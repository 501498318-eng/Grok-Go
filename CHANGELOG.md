# 更新日志

本项目遵循语义化版本号。

## 1.6.3 - 2026-07-14

- 新增按档案启用的协议兼容模式，统一管理 OpenAI Responses 与 Anthropic Messages 过滤规则。
- 修复部分 Responses 兼容接口插入缺少 `sequence_number` 的 synthetic 空首帧时，Grok Build 无法继续对话和调用工具的问题。
- 保留 Responses 函数调用事件及合法序号，不生成、重排或猜测上游字段。
- 自动迁移旧版 Messages thinking 过滤开关，现有 Anthropic 档案行为保持不变。
- 增加 Responses 流式、非流式、函数调用、异常放行和协议透传测试。

## 1.6.2 - 2026-07-14

- 修复 config.toml 原本不存在、应用前被其他程序创建时可能被覆盖的问题。
- 增强 Messages 过滤代理在上游超时和连接中断时的处理。
- 增加代理 HTTP、SSE、端口占用和超时测试。
- 拆分前端组件、业务 Hook 和样式模块，提升后续维护性。
- Windows 分发改为 NSIS 安装程序主版本，并提供 ZIP 解压版。

## 1.6.1 - 2026-07-13

- 移除底部连接诊断与 config.toml 预览折叠面板。
- 将 config.toml 预览改为右侧常驻区域，并保留实时更新与复制功能。
- 将测试连接按钮移动到已配置模型区域。
- 将连接诊断改为顶部圆角浮层，并优化加载、成功、失败和关闭状态。

## 1.6.0 - 2026-07-13

- 产品正式命名为 Grok Go，并更新高清多尺寸 Windows 图标。
- 支持 OpenAI Responses、Chat Completions 和 Anthropic Messages 协议。
- 支持从上游读取模型并自主添加、移除和设置默认模型。
- 新增本地 Messages thinking 过滤代理，修复部分兼容接口的工具调用解析问题。
- 新增安全备份恢复、外部修改检测和 JSON 档案导入导出。
