---
name: superconnectx-mcp
description: 使用 SuperConnectX MCP 检查串口、连接会话、设备模板和日志；发送命令或执行破坏性操作前必须获取显式写租约。
---

# SuperConnectX MCP Skill（SuperConnectX MCP 技能）

本 Skill 只是 MCP 的使用封装（工作流 / 安全约束），**不连接设备、不启动进程**。必须配合 MCP runtime：

1. **独立 CLI `scx-mcp`**：不需要打开桌面客户端；看不到 GUI 已连接会话
2. **桌面 MCP HTTP**：客户端开着并启用后，可读取 GUI 已连接会话和日志；不能关闭 `owner=user` 会话

安装方式见 [INSTALL.md](INSTALL.md)。

## 运行时选择

- `scx-mcp --stdio`：独立 CLI；默认完整本地权限，可用 `--mode read-only` 收紧
- 桌面端 MCP：需要 SuperConnectX 运行，在设置中启用并选择权限
- HTTP MCP：连接本机 Endpoint，必须提供 Bearer Token

## 工作流程（Workflow）

1. 使用 `serial_list_ports` 枚举串口，绝不猜测设备路径。
2. 创建会话前先调用 `session_list`。
3. 诊断优先使用 `log_tail`、`log_search`、`log_summarize`、`log_find_anomalies` 和 `log_analyze`。
4. 执行设备专用命令前先读取 `template_list`/`template_get`。
5. 任何写入前调用 `session_acquire_write_lease`，完成后立即调用 `session_release_write_lease`。
6. 优先使用 `session_run_template_command` 或有超时的 `session_send_and_wait`，不要执行无边界写入。
7. `session_stop` 和文件上传必须要求用户明确确认。

## 证据输出格式（Evidence format）

回复应包含：结论、`sessionId`、日志行号、原始证据文本、影响和下一步建议。不得输出密码、Bearer Token 或 Authorization 原文。

```text
结论：……
证据：session=<id>，line=<行号>，text="……"
影响：……
建议：……
```

工具路由见 [references/tools.md](references/tools.md)；写入和诊断安全规则见 [references/safety.md](references/safety.md)。
