# SuperConnectX MCP Skill 安装

Skill **不连接设备**，只教 AI 如何安全调用 MCP 工具。真正连串口的是独立 CLI：`scx-mcp`。

```text
AI Client
  ├── Skill（本目录）      工作流 / 安全约束 / 证据格式
  └── MCP Runtime
        ├── scx-mcp CLI    不需要桌面端（推荐）
        └── 桌面 MCP HTTP  需要打开 SuperConnectX
```

## 方式 A：Git 克隆（方便改）

适合自己改 workflow、中文说明、设备经验后继续用。

```bash
# 稀疏检出 skill 目录
git clone --depth 1 --filter=blob:none --sparse https://github.com/SuperStudio/SuperConnectX.git scx-tmp
cd scx-tmp
git sparse-checkout set packages/superconnectx-mcp-skill

# 安装到常见 Agent skill 目录（任选其一或都装）
mkdir -p ~/.agents/skills ~/.codex/skills
rm -rf ~/.agents/skills/superconnectx-mcp ~/.codex/skills/superconnectx-mcp
cp -R packages/superconnectx-mcp-skill ~/.agents/skills/superconnectx-mcp
cp -R packages/superconnectx-mcp-skill ~/.codex/skills/superconnectx-mcp
```

改完后直接编辑 `~/.agents/skills/superconnectx-mcp/SKILL.md`；要从仓库同步时再重新 `cp -R`。

若本机已 clone 整个 SuperConnectX 仓库，也可：

```bash
ln -sfn /path/to/SuperConnectX/packages/superconnectx-mcp-skill ~/.agents/skills/superconnectx-mcp
```

## 方式 B：桌面端一键安装

打开 **SuperConnectX → 设置 → MCP → 安装 Skill**。

客户端会把内置 skill 复制到：

- `~/.agents/skills/superconnectx-mcp`
- `~/.codex/skills/superconnectx-mcp`（若目录存在或可创建）

之后可在上述目录直接改文档；客户端再次安装会覆盖同名 skill。

## 方式 C：仓库一键安装

不从 Release 下载 tgz。克隆仓库后执行：

```bash
bash scripts/install-mcp.sh
```


## 配套安装 CLI

CLI 不发布到 npm。克隆仓库后执行：

```bash
bash scripts/install-mcp-cli.sh
export PATH="$HOME/.local/bin:$PATH"
scx-mcp --doctor
scx-mcp --print-config
```


## 验证

在 AI 对话中引用 `$superconnectx-mcp` 或打开本 skill，然后让它执行：

1. `serial_list_ports`
2. `session_list`
3. 只读日志工具

若工具不可用，先检查 `scx-mcp --doctor` 和 MCP 配置，而不是改 Skill。
