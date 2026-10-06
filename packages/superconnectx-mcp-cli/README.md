# @superconnectx/mcp-cli

独立运行的 SuperConnectX MCP CLI。它留在仓库目录里，不发布到 npm，也不打进桌面安装包。

## 安装

在仓库根目录执行：

```bash
bash scripts/install-mcp-cli.sh
export PATH="$HOME/.local/bin:$PATH"
scx-mcp --doctor
scx-mcp --print-config
```

脚本会构建 `packages/superconnectx-mcp` 和 `packages/superconnectx-mcp-cli`，并在 `~/.local/bin/scx-mcp` 放一个启动器。仓库移动后重新执行一次脚本。

## AI 客户端配置

把 `--print-config` 的输出合并到 Claude Desktop、Cursor 或 Codex 的 MCP 配置。默认形态是：

```json
{
  "mcpServers": {
    "superconnectx": {
      "command": "scx-mcp",
      "args": ["--stdio"]
    }
  }
}
```

默认是完整本地权限。收紧权限时使用：

```bash
scx-mcp --stdio --mode read-only
scx-mcp --stdio --mode read-write
scx-mcp --stdio --mode full --no-export
```

只在本机使用 HTTP：

```bash
scx-mcp --http --port 32180 --token CHANGE_ME
```

## 后续流程

1. 运行 `scx-mcp --doctor`，确认能看到串口。
2. 运行 `scx-mcp --print-config`，写入 AI 客户端配置。
3. 安装 Skill：按 `packages/superconnectx-mcp-skill/INSTALL.md` 复制到 `~/.agents/skills/superconnectx-mcp`。
4. 在 AI 客户端里先调用 `serial_list_ports` 和 `session_list`。

CLI 只能管理自己建立的会话。要复用桌面端已经打开的会话，改用桌面端设置里的 MCP HTTP。

## 扩展设备能力

```bash
scx-mcp --init
scx-mcp --new template 我的设备, version, status
scx-mcp --new tool 读版本
```

生成的文件在 `~/.superconnectx/`。模板只需要命令名，工具只需要改生成函数里的逻辑。完整说明见 `doc/MCP-DEVELOPER-PROFILE.md`。
