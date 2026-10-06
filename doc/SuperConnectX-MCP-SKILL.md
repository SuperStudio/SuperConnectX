# SuperConnectX MCP / Skill / CLI

当前交付入口只有一个：`doc/MCP-DELIVERY.md`。

| 组件 | 作用 | 是否连接设备 |
| --- | --- | --- |
| MCP | 工具、权限、连接和日志 | 是 |
| Skill | AI 使用规范 | 否 |
| CLI `scx-mcp` | 不打开桌面端的 MCP runtime | 是 |
| 桌面 MCP HTTP | 复用 GUI 已有会话 | 是 |

安装和验收：

```bash
bash scripts/install-mcp.sh
bash scripts/verify-mcp.sh
```
