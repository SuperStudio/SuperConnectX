# @superconnectx/mcp

SuperConnectX MCP **核心库**：工具契约、权限策略、STDIO/HTTP Transport、NativeFacade、模板与写租约。

CLI 不发布到 npm。在仓库根目录执行：

```bash
bash scripts/install-mcp.sh
```


本包不依赖 Electron。桌面端、CLI、测试都通过 `McpFacade` 接入，Transport 内不复制连接业务。

## 库用法

```ts
import { createMcpServer, McpLoopbackServer, startMcpStdio, runMcpCli } from '@superconnectx/mcp'

await startMcpStdio(facade)
const server = new McpLoopbackServer(facade, process.env.SCX_MCP_TOKEN)
await server.start(32180)

// 也可直接复用同一套 CLI 入口
await runMcpCli(['--stdio', '--mode', 'full'])
```

## 返回契约

所有工具返回：

```json
{
  "data": {},
  "meta": {
    "requestId": "...",
    "truncated": false,
    "source": "superconnectx"
  }
}
```

业务失败时 `data.error = { code, message, retryable }`。

## 写操作审计

`session_send` / `session_stop` 等写工具会记录审计事件（调用者、session、命令摘要、结果）。  
CLI 默认写入 `~/.superconnectx/mcp-audit.jsonl`；也可传入自定义 `audit` sink。

## 安全约束

- HTTP 只绑定 `127.0.0.1`，并使用 Bearer Token。
- 写命令必须先获取会话级短时写租约。
- 停止会话、上传文件等破坏性操作必须显式确认。
- 模板是声明式 JSON，不能执行 Shell、JavaScript 或任意网络请求。

## 维护边界

- `src/server.ts`：MCP 工具契约与输入校验
- `src/transports.ts`：STDIO/HTTP 生命周期与安全
- `src/native-facade.ts`：独立 CLI 默认串口后端
- 设备连接/GUI 会话由宿主实现 `McpFacade`

## 开发者扩展

`scx-mcp --init` 创建目录，`scx-mcp --new template|tool|parser 名称` 生成短模板或工具文件。短模板在加载时自动补齐缺省字段。详见 `doc/MCP-DEVELOPER-PROFILE.md`。
