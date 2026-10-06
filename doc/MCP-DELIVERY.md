# SuperConnectX MCP 交付说明

这套交付只走仓库，不走 npm，不单独打 MCP 包。

## 三个入口

| 入口 | 位置 | 用途 | 交付方式 |
| --- | --- | --- | --- |
| 桌面 MCP | 设置 → MCP | 复用桌面端已经打开的会话和日志 | 随主应用安装包 |
| CLI | `packages/superconnectx-mcp-cli` | 不打开桌面端，直接连串口 | 仓库内安装 |
| Skill | `packages/superconnectx-mcp-skill` | 告诉 AI 如何安全调用工具 | 仓库内复制或桌面端安装 |

## 安装

```bash
git clone https://github.com/SuperStudio/SuperConnectX.git
cd SuperConnectX
git checkout master
bash scripts/install-mcp.sh
export PATH="$HOME/.local/bin:$PATH"
```

`scripts/install-mcp.sh` 会：

1. 构建 MCP 核心和 CLI。
2. 安装 `~/.local/bin/scx-mcp`。
3. 复制 Skill 到 `~/.agents/skills/superconnectx-mcp` 和 `~/.codex/skills/superconnectx-mcp`。
4. 运行 `scx-mcp --doctor` 和 `scx-mcp --print-config`。

## 接入 AI 客户端

把 `--print-config` 输出合并到 Claude Desktop、Cursor 或 Codex：

```json
{
  "mcpServers": {
    "superconnectx": {
      "command": "scx-mcp",
      "args": ["--stdio", "--mode", "full"]
    }
  }
}
```

然后在 AI 对话中引用 `$superconnectx-mcp`，先执行：

1. `serial_list_ports`
2. `session_list`
3. `log_tail` 或 `log_search`

## 验收

```bash
bash scripts/verify-mcp.sh
```

验收通过的标准：

- `scx-mcp --doctor` 返回 `ok: true`。
- `scx-mcp --print-config` 输出 `mcpServers.superconnectx`。
- `~/.agents/skills/superconnectx-mcp/SKILL.md` 存在。
- `pnpm run test:mcp` 通过。

## 开发者扩展

安装后用目录扩展设备能力，不用改 MCP 客户端配置：

```bash
scx-mcp --init
scx-mcp --new template 我的设备, version, status
scx-mcp --new tool 读版本
scx-mcp --doctor
```

模板、解析器、工具和 Facade 的写法见 `doc/MCP-DEVELOPER-PROFILE.md`。
## 边界

- CLI 看不到桌面端已经打开的会话。
- 桌面 MCP 能看到 GUI 会话，但不能关闭 `owner=user` 的会话。
- Skill 不连接设备，只约束 AI 怎么调用 MCP。
- 写操作前必须获取写租约；停止会话和上传文件必须由用户明确确认。
