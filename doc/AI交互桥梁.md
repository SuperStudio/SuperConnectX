# AI 交互桥梁（标准 MCP）

AI 交互桥梁是 SuperConnectX 内置的 MCP 扩展。它在 Electron 主进程中运行标准 Streamable HTTP MCP Server，把软件现有的串口枚举、运行连接、终端收发、连接档案、预设命令、业务配置和日志查询能力转换为受控的 MCP Tools，供 Codex、Cursor 等本机 MCP Client 使用。

该功能属于应用内建能力，不依赖“插件”菜单，也不是外置插件。MCP 层复用 SuperConnectX 原有的 COM、Telnet、FTP、存储和日志业务，不另行实现串口驱动或协议 Client。

当前支持范围：

- Windows 与 Linux 共用同一套 MCP Adapter、Application Core 和 Tool 契约；
- MCP SDK 固定为 `@modelcontextprotocol/sdk 1.30.0`；
- Transport 固定为有状态 Streamable HTTP；
- 对外能力固定为 Tools，不提供 Resources、Prompts、Sampling、Roots 或工作流系统；
- 不提供 STDIO、Named Pipe、浏览器或局域网入口；
- macOS 保持通用代码边界和 `build:mac` 入口，但没有经过签名、发布与实机验证的交付包，不列为受支持平台。

## 1. 启用与连接

1. 启动 SuperConnectX。
2. 打开顶部菜单“工具 → AI 交互桥梁”。
3. 开启“启用桥梁”，等待“MCP 状态”变为“运行中”。
4. 点击“一键复制 MCP 配置”。复制内容包含接入说明和当前实例的真实 URL、服务名、Bearer Token。
5. 将完整内容发送给 AI，让 AI 按当前 MCP Client 的格式完成配置；也可以自行写入客户端设置。
6. 让 AI 连接当前实例并调用 `server_get_info`。页面和 AI 交互桥梁页签的状态点显示“AI 已连接”后，表示至少存在一个已经完成 MCP initialize 的有效客户端会话。

复制内容使用 Codex TOML 作为示例。其他 MCP Client 可以转换配置格式，但必须保持服务名、URL 和 `Authorization` 内容不变：

```toml
[mcp_servers.superconnectx_1]
url = "http://127.0.0.1:32180/mcp"
http_headers = { Authorization = "Bearer <当前实例 Token>" }
enabled = true
```

配置被导入客户端只代表“接入配置已经存在”；客户端完成实时握手后才算“已连接”。界面使用二值状态，不把一个客户端建立的多条 MCP 通信链路误显示为多个 AI。

每个软件实例通常只需配置一次。应用关闭期间 endpoint 暂时离线；同一实例使用原端口和原 Token 再次启动后，客户端可以继续使用原配置。修改端口或重新生成 MCP Token 后，必须更新客户端配置。

## 2. 服务状态、权限和能力边界

### 2.1 服务状态

| 状态            | 含义                                              |
| --------------- | ------------------------------------------------- |
| `disabled`      | 当前实例未启用 MCP，不监听端口                    |
| `starting`      | 正在创建 loopback HTTP Server                     |
| `running`       | endpoint 已监听，可以 initialize                  |
| `stopping`      | 正在发送中止信号、关闭 MCP session 和 HTTP Server |
| `port_conflict` | 固定端口被占用，服务不会静默改用随机端口          |
| `error`         | 启动或运行异常，页面显示最后错误                  |

“测试 MCP 可用性”会使用官方 SDK 创建临时 loopback Client，依次完成 initialize、`tools/list`、`server_get_info` 和 session DELETE。自检 Client 不计入“AI 已连接”状态。自检通过表示 transport、鉴权、当前权限下的 Tool 可见性和 `server_get_info` 调用链可用；结果中的 Tool 总数来自 Registry 的 32 项登记，不表示自检逐项调用了全部 Tool。自检不会打开设备，也不等于外部 MCP Client 已经连接。

### 2.2 运行时权限

MCP 默认关闭。每个应用进程的 AI 权限固定从“只读”开始；权限只保存在主进程内存中，不写入 `ai-bridge.json`。

- “只读”：只读 Tool 可见，写 Tool 被隐藏并由服务端再次拒绝；
- “完全控制”：当前运行期间允许调用写 Tool；
- 停用桥梁或退出应用后，完全控制授权失效；
- 完全控制只能通过当前应用主窗口的本地 IPC 手动开启；
- 修改配置文件、调用 `config_patch` 或连接 MCP 都不能把权限提升为完全控制。

MCP Tool annotations 可供客户端显示审批提示，但服务端的权限、能力组、租约和输入校验才是最终授权依据。

### 2.3 七个能力组

能力组开关保存在 AI 配置中。关闭一个能力组后，即使权限为“完全控制”，该组 Tool 仍不可见且不可调用。`server_get_info` 是桥梁状态基础接口，在桥梁运行时始终保留。

| 能力组                               | 访问类型 | MCP Tools                                                                                                                                                                                      |
| ------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 读取串口连接与终端输出 `sessionRead` | 只读     | `server_get_info`、`serial_list_ports`、`session_list`、`session_read_events`、`session_read_buffer`、`session_wait_events`、`session_wait_pattern`                                            |
| 发送终端命令 `serialWrite`           | 写入     | `session_acquire_write`、`session_release_write`、`session_send`、`session_send_and_wait`                                                                                                      |
| 连接与断开 `sessionManage`           | 写入     | `session_start_saved`、`session_start_port`、`session_stop`                                                                                                                                    |
| 已保存的连接配置 `connectionManage`  | 读写混合 | `connection_list`、`connection_create`、`connection_update`、`connection_delete`                                                                                                               |
| 预设命令与命令组 `commandManage`     | 读写混合 | `command_group_list`、`command_group_create`、`command_group_update`、`command_group_delete`、`preset_command_list`、`preset_command_create`、`preset_command_update`、`preset_command_delete` |
| 软件业务配置 `configManage`          | 读写混合 | `config_describe`、`config_get`、`config_patch`                                                                                                                                                |
| 日志与 AI 活动记录 `auditRead`       | 只读     | `log_read_tail`、`log_search`、`activity_read`                                                                                                                                                 |

总计 32 项 MCP Tools。读写混合组在只读权限下只显示查询 Tool。

### 2.4 控制范围

AI 交互桥梁只开放连接调试所需的串口枚举、COM/Telnet/FTP 运行连接、终端收发、连接档案、预设命令、业务配置和日志能力。它不模拟鼠标、键盘、窗口焦点或页面跳转，也不允许 AI 切换用户当前标签、输入框和当前命令组。

皮肤、字体预览、虚拟串口、帮助、更新、备份恢复、快捷键、语法高亮编辑和日志过滤面板等辅助功能不在 MCP 控制范围内。Bootloader、X/Y-Modem、OTA、批量连接等长事务也没有复用普通发送接口；这类能力需要独立定义任务状态、进度、取消、超时和逐项结果后才能扩展。

MCP 不提供绕过软件命令准备和原连接 backend 的原始设备写入口。客户端不能借助 `config_patch`、连接档案或额外参数扩大已经登记的能力范围。

## 3. Tool 行为约束

### 3.1 三种不同的“会话”

| 名称        | 含义                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------- |
| AI 对话     | 用户在 Codex、Cursor 等产品中的聊天或任务上下文，SuperConnectX 不管理                              |
| MCP session | Streamable HTTP 协议状态，包含 `Mcp-Session-Id`、principal、Client 信息和并发计数                  |
| 运行连接    | SuperConnectX 主进程中的 COM、Telnet 或 FTP 业务连接；Tool 名为兼容稳定接口而使用 `session_*` 前缀 |

一个 MCP Client 可以建立多条 MCP session；这不等于多个 AI。MCP session 断开会释放该 principal 的写租约，但不会自动关闭已经建立的业务连接。业务连接需要通过 `session_stop`、界面操作或应用退出明确结束。

### 3.2 连接与档案

- `serial_list_ports` 查询当前系统可用串口，不要求端口已经打开；
- `session_start_port` 只能打开本次枚举中确实存在的串口路径；Windows 会规范化 `COMn`，Linux 保留 `/dev/tty*` 路径；
- `session_start_saved` 通过原项目已有的连接档案和 backend 建立连接；
- 已经在 GUI 中打开的同一 COM 会被复用，避免重复占用操作系统句柄；
- AI 建立的运行连接会出现在普通终端页签中，页签由主进程运行状态驱动，不由 Renderer 再次自动连接；
- 业务连接关闭后，对应 AI 管理页签随 `session.closed` 移除，不保留不可关闭页签或自动重连计时器；
- AI 管理页签不写入跨进程会话恢复数据，应用重启后以主进程真实状态为准；
- 保存档案的查询覆盖现有档案；`connection_create` 和 `connection_update` 当前只开放 Telnet、FTP 类型；密码从存储读取时只向 Tool 返回掩码；
- `connection_delete` 只删除保存档案，不关闭已经运行的连接；关闭运行连接必须调用 `session_stop` 或使用界面操作；
- 更新、删除连接档案、命令组和预设命令需要调用方提供最新 `expectedRevision`。

默认不允许 AI 关闭用户从界面打开的运行连接。页面中的“允许 AI 关闭用户打开的串口连接”开关放开这层来源保护；实际调用仍要求完全控制、`sessionManage` 能力组和当前 AI principal 的写租约。AI 自己创建的连接可以在完全控制下正常停止。

### 3.3 发送、写租约与命令设置

每个运行连接同一时刻最多有一个 AI 写租约。租约在主进程内包含当前 MCP principal 和一个 32 字节随机、不持久化的 `writeLeaseId`：

- `session_start_saved`、`session_start_port` 和 `session_acquire_write` 会返回 `writeLeaseId`；
- 后续 `session_send`、`session_send_and_wait`、`session_stop` 和 `session_release_write` 应继续携带该凭证；
- 同一 MCP principal 保持兼容，可以省略凭证；调用切换到另一条 MCP session 时，只有持有当前 `writeLeaseId` 的同一工作流可以接续写入；
- 凭证匹配后，租约所有者迁移到新的 principal；未持有凭证的其他 Client 仍返回 `SESSION_WRITE_LOCKED`；
- 第一次 `session_send` 或 `session_send_and_wait` 也会自动尝试获取当前空闲的租约，并在成功结果中返回凭证；
- 显式 `session_acquire_write/release_write` 用于多步操作；
- 不存在的运行连接返回 `SESSION_NOT_FOUND`，不会创建空租约；
- 租约五分钟无写入后过期；
- 当前租约 principal 断开、业务连接关闭或桥梁停止时释放相关租约。

写租约用于协调多个 AI principal，不阻止用户在 GUI 中发送。GUI 与 MCP 的发送统一进入同一个按运行连接划分的 FIFO `CommandScheduler`，因此同一 backend 的写入不会重叠，不同运行连接仍可并行。

MCP 发送使用当前 GUI/业务配置中的自动换行、HEX、CRC 开关和 CRC 算法。GUI 通过单调 revision 把命令设置同步到主进程；组件重新挂载后会读取主进程 revision 并继续同步，不允许旧设置覆盖新设置。

`session_send_and_wait` 在同一个排他队列任务中取得起始 cursor、发送命令并等待字面量模式，避免同一连接上的其他发送插入事务中间。单次等待最长 30 秒，返回内容保持有界。

`session_send` 返回 `accepted: true`、`tx.accepted` 或终端中的 AI 发送记录，只表示软件完成命令准备并接受了 backend 发送，不证明设备已经收到或执行。设备结果应通过 `session_read_buffer`、`session_wait_events`、`session_wait_pattern` 或真实硬件行为确认。

### 3.4 有界读取与 RX 热路径

终端输出使用 sequence cursor 读取，不向 Client 推送无界数据：

- 单次读取最多 1000 个事件、128 KiB；
- RX retain 默认最多 512 个事件、全局 8 MiB、单运行连接 2 MiB；
- 同步 RX 回调只执行常数时间估算、尾部入队和异步 flush 调度，不执行 HTTP 写入、深复制或 JSON 序列化；
- pending 队列受 256 个事件和约 512 KiB 估算字节限制；
- waiter 全局最多 128 个，单运行连接最多 32 个；
- `truncated` 只表示本次响应受到事件数或响应字节上限截断，Client 应使用 `nextCursor` 继续读取；
- `droppedEvents`、`droppedBytes` 是进程启动以来 pending 溢出和 retained 容量淘汰的累计计数；retained 中已经被 Client 读过的旧事件被淘汰时也会增加，因此二者不等于“当前 Client 未读丢失量”，`droppedBytes` 也包含序列化后的事件元数据，不是原始串口字节数；
- Client 是否已经落后于当前保留窗口，应以请求的 `afterCursor` 与返回的 `oldestSequence`、`latestSequence` 对比判断；当前实现没有按 Client 保存确认游标，不能从全局 dropped 计数反推出某个 Client 的实际未读损失；
- 没有真实 MCP Client、桥梁未启用或读取能力组关闭时，不再采集新的 MCP RX；已经保留的数据继续受容量淘汰约束，并在运行连接关闭或应用退出时清理；
- GUI 原有的 `on-recv-data`、终端渲染和连接日志路径保持独立，不受慢 MCP Client 反压。

这条链路面向交互式观察、命令闭环和重点模式等待，不是无界日志流。高吞吐启动洪峰需要完整回放时，应启用原连接日志并使用有界 `log_read_tail`、`log_search` 分段定位；需要逐字节取证时应直接保留原日志文件。MCP RX Buffer 溢出不会阻塞 GUI 收包，但也不承诺替代完整日志归档。

### 3.5 有界连接日志读取

`log_read_tail` 和 `log_search` 读取软件原有的连接日志，不复制或维护第二份设备日志：

- 尾读默认返回最多 32 KiB、200 行，调用上限为 64 KiB、1000 行；
- 搜索默认扫描 512 KiB，单次最多扫描 2 MiB、返回 100 个匹配；
- 搜索结果正文总量最多 64 KiB，每个匹配最多附带前后各 5 行上下文；
- 两个 Tool 都返回文件 offset；`log_search` 可以通过 `fromOffset` 分段继续扫描，`log_read_tail` 每次只读取当时的有界文件尾部；
- 运行连接尚未生成日志文件时返回 `LOG_READ_FAILED`，这不表示 MCP transport 或其他只读 Tool 不可用。

### 3.6 配置开放范围

MCP 的 `config_*` 只访问非 AI 的业务配置白名单：

- `settings`：日志拆分、自动滚动、显示上限、命令历史、发送后清理等串口调试相关设置；
- `com-settings`：波特率、数据位、停止位、校验、编码、流控、RTS/DTR、收发显示、自动换行、HEX 和 CRC 等端口设置。

AI 交互桥梁自身的启用状态、Token、基础端口、实例端口、能力组、活动日志目录和运行时权限不属于 `config_*` 范围。皮肤、虚拟串口、软件更新和其他辅助功能也不对 MCP 开放。

`config_patch` 使用字段 schema、类型范围和 `expectedRevision` 校验。对已运行 COM 的可即时设置会通过共享业务服务应用并通知 Renderer；需要重新连接的设置在结果中返回 `requiresReconnect`。

### 3.7 Tool 契约与错误

Operation Registry 是 Tool 名、能力组、读写级别、input/output schema、annotations、deadline、handler 和业务错误码的单一注册来源。每个正式 Tool 都必须显式声明 Zod output schema；schema 使用明确的数据结构或受控 record 结构，成功结果在返回前再次校验。

成功响应同时包含：

- `structuredContent: { data: ... }`；
- JSON 文本 `content`，超过 4096 字符时截断显示；
- 结构化结果总大小上限 1 MiB。

业务失败返回稳定结构：

```json
{
  "data": {
    "error": {
      "code": "SESSION_NOT_FOUND",
      "message": "...",
      "retryable": false
    }
  }
}
```

Tool handler 中的未分类异常统一映射为 `INTERNAL_ERROR` 和通用提示。内部路径、文件名、原始异常和堆栈只进入受控主进程日志，不通过 Tool 响应返回 MCP Client。

Client 取消请求、Tool deadline、MCP session 关闭、Token 轮换和服务停止使用同一条 `AbortSignal` 链中止在途等待；业务错误继续使用上述 `{ data: { error } }` 契约，HTTP/MCP transport 错误由协议层返回。权限或能力组变化后，服务端发送标准 Tool 列表变更通知，并在 handler 执行前再次校验最新 Policy，已经缓存旧 Tool 列表不能绕过授权。

## 4. 运行时架构

```text
MCP Client
  │  Streamable HTTP / Bearer Token
  ▼
McpHttpSecurity → McpServerManager → McpSessionStore
  ▼
McpAdapter → AiOperationRegistry → PolicyService
  ▼
Application Core
  ├─ SessionLeaseService
  ├─ CommandScheduler
  ├─ AiEventBuffer
  └─ handlers
  ▼
Host Ports / Host Adapters
  ▼
ConnectionService / ConfigService / RuntimeEventHub / CoreCatalog
  ▼
SuperConnectX 原有 COM、Telnet、FTP、存储与日志实现
```

Renderer 的管理链路与 MCP 调用链路分开：

```text
AiServicePage / AiActivityOverlay / AiActivityHistory
  ▼
preload 中的有限 aiServiceApi
  ▼
IpcAiService
  ▼
AiConfigService / McpServerManager / AiActivityService
```

Renderer 不注册 Tools、不保存 Token 副本、不直接承载 MCP Server。`src/main/index.ts` 只装配并启动 `AiServiceManager`；MCP SDK、Express 和 HTTP 细节停留在 MCP Adapter 层，Application Core 不依赖 Electron IPC、Vue 或平台 API。

### 4.1 运行依赖

| 依赖                             | 当前版本 | 用途                                           |
| -------------------------------- | -------- | ---------------------------------------------- |
| `@modelcontextprotocol/sdk`      | `1.30.0` | 标准 MCP Server、Client 自检和 Streamable HTTP |
| `express`                        | `5.2.1`  | `/mcp` 路由、JSON body 上限和安全中间件        |
| `zod`                            | `4.4.3`  | 配置、IPC、Tool input/output 契约              |
| `proper-lockfile`                | `4.1.2`  | 多进程 AI 配置文件写锁                         |
| `write-file-atomic`              | `7.0.0`  | `ai-bridge.json` 同目录原子替换                |
| `serialport` / 原项目协议 Client | `13.x`   | 宿主连接实现，由 Host Adapter 和共享服务复用   |

### 4.2 代码目录

| 目录                                                 | 职责                                                                                      |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/main/extensions/ai-control/AiServiceManager.ts` | AI 扩展组合根，装配配置、Registry、Adapters、活动日志和生命周期                           |
| `application/`                                       | Registry、Policy、运行时授权、写租约、发送队列、RX Buffer、错误目录和业务 handlers        |
| `ports/`                                             | Session、配置、事件、串口目录和审计的窄接口                                               |
| `adapters/host/`                                     | 把现有 SuperConnectX 连接、配置、事件和串口业务适配到 Ports                               |
| `adapters/mcp/`                                      | 官方 MCP SDK、Streamable HTTP、安全中间件、session Store 和结果映射                       |
| `infrastructure/`                                    | 独立 AI 配置、活动日志、日志读取与文件轮转                                                |
| `ipc/IpcAiService.ts`                                | 主窗口可调用的管理 IPC；返回配置时统一隐藏 Token                                          |
| `src/main/services/`                                 | GUI 与扩展共用的 ConnectionService、ConfigService、RuntimeEventHub 和 InstanceCoordinator |
| `src/renderer/src/extensions/ai-control/`            | 独立 AI 交互桥梁页面、活动浮窗、历史页面和 Renderer 状态组合函数                          |
| `src/shared/extensions/ai-control/`                  | 主进程、preload、Renderer 共用的配置、状态和活动类型                                      |
| `src/shared/serial/CommandPreparation.ts`            | GUI 与 MCP 共用的换行、HEX、CRC 命令准备逻辑                                              |

### 4.3 连接生命周期保护

每个运行连接拥有主进程内部的 `{ sessionId, generation }` 生命周期标识。Direct、FTP 和 Worker backend 的 data、log、close、exit 回调都捕获该标识，并同时校验当前 Client/Worker 对象身份。

```text
backend close(lifecycle)
  → Connector 对象身份校验
  → ConnectionService 校验 generation
  → 当前连接唯一 finalizer
  → 清理状态、写租约、发送队列和 RX Buffer
  → 发布一次 session.closed 和 Renderer 关闭通知
```

上一 generation 延迟到达的回调不能操作复用同一 sessionId 的当前连接。主动 stop、backend close 和 Worker exit 共用同一个关闭裁决，不会重复关闭或误删当前 Client。

## 5. 本机安全模型

| 边界         | 当前实现                                                            |
| ------------ | ------------------------------------------------------------------- |
| 监听地址     | 只绑定 `127.0.0.1`，endpoint 固定为 `/mcp`                          |
| HTTP 方法    | 只接受 `POST`、`GET`、`DELETE`；其他方法返回 405                    |
| Host         | 必须精确匹配 `127.0.0.1:<实际端口>`                                 |
| Origin/CORS  | 拒绝任何带 `Origin` 的请求，不启用 CORS，不接受浏览器 preflight     |
| 鉴权         | 每个实例独立生成 32 字节随机 Bearer Token，使用摘要和常数时间比较   |
| 请求上限     | header 16 KiB，JSON body 1 MiB，HTTP header/request timeout 10 秒   |
| session 上限 | 每实例最多 32 个 MCP session                                        |
| 并发上限     | 每 session 8 个请求，全实例 32 个请求                               |
| 频率限制     | initialize 与每个 session 分别使用容量 20、每秒恢复 2 个 token 的桶 |
| 空闲清理     | MCP session 空闲 30 分钟关闭；写租约空闲 5 分钟释放                 |
| Token 轮换   | 向在途 Tool 发送取消信号并废止全部旧 MCP session，不关闭业务连接    |
| 动态策略     | 权限或能力组变化后更新 Tool 可见性；handler 执行前再次检查          |

独立配置位于 Electron `userData` 下：

```text
userdata/ai-bridge.json
```

常见位置：

```text
Windows: %APPDATA%\superconnectx\userdata\ai-bridge.json
Linux:   ~/.config/superconnectx/userdata/ai-bridge.json
```

配置结构由 `version`、单调 `revision`、共享设置和实例设置组成。写入使用跨进程文件锁和同目录原子替换；外部变化由文件监听与周期 stat 检查同步。POSIX 文件权限固定为 `0600`；Windows 使用当前用户的 userData 继承 ACL。

配置文件包含实例 Token，应按敏感文件处理。普通状态 IPC 只返回 Token 指纹，配置 IPC 把所有 Token 替换为 `[REDACTED]`；只有“一键复制 MCP 配置”会把完整 Token 放入剪贴板。重新生成 Token 后应删除或更新客户端中的旧配置。

`writeLeaseId` 只存在于主进程运行时和对应 Tool 的输入、输出中，不写入 `ai-bridge.json`。活动记录、TX 投影和落盘日志会把该字段视为凭证并脱敏；客户端应像保存当前工作流状态一样保存它，不应把它发送给无关 Client。

`ai-bridge.json` 不包含 AI 权限字段，因此本地持久配置不能把只读权限提升为完全控制。桥梁是否启用可以持久化；即使上次处于完全控制，下次启动仍为只读。

## 6. 多实例

普通重复启动由 `InstanceCoordinator` 协调：首个进程维护协调器，后续启动请求由协调器分配最小空闲槽位并创建新实例。内部槽位从 0 开始，页面和复制配置中的实例 ID 从 1 开始显示。

默认端口规则：

```text
实例 ID 1 → basePort + 0 → 32180
实例 ID 2 → basePort + 1 → 32181
实例 ID N → basePort + (N - 1)
```

每个实例具有独立的：

- 启用状态、别名和可选端口覆盖；
- 稳定 Token 与 endpoint；
- MCP session Store、Client 状态和运行时只读/完全控制权限。

基础端口、能力组、关闭用户连接开关和活动日志设置属于共享配置，通过同一个 `ai-bridge.json` 在运行实例间同步。运行时权限不持久化，也不跨进程同步。

端口冲突时固定端口经过三次有界监听尝试后进入 `port_conflict`，不会选择随机端口。修改基础端口或当前实例独立端口后，需要重新复制 MCP 配置。

实例 lease、心跳和启动请求存放在：

```text
userData/_instance_runtime
```

该目录只用于进程协调，不属于业务配置和备份数据。

## 7. AI 操作反馈与记录

每次 Tool 查询、控制、失败以及 MCP Client 连接/断开都会生成 `ai.activity` 事件：

- 页面内“AI 操作历史”按时间显示只读记录；
- 活动浮窗可配置九宫格位置、20%～100% 透明度、是否可点击以及 1～15 秒或永久停留；
- 点击可交互浮窗会打开历史页面；永久浮窗需要手动关闭；
- “删除记录”使用警告确认框，确认后删除当前文件和全部轮转归档；
- 日志异步写入 `ai-activity` 子目录，默认单文件 10 MiB、保留 5 个文件；
- 历史 API 单次最多返回 2000 条、最多扫描 1 MiB 文件尾部；页面加载并保留最近 500 条，界面明确显示“最近 500 条”而不是暗示本地只保存 500 条；
- 事件在主进程和日志中保持 UTC ISO 时间戳；Renderer 使用 Electron 当前识别的操作系统时区显示为 `YYYY-MM-DD HH:mm:ss.SSS`，不跟随中英文界面切换，也不改写历史文件。

命令正文有三级策略：

| 策略      | 活动日志和 MCP TX 读取中的命令正文                   |
| --------- | ---------------------------------------------------- |
| `none`    | 不保存、不返回正文；操作名、时间、结果和错误码仍保留 |
| `preview` | 脱敏后最多保留前 120 个字符，默认值                  |
| `full`    | 保存脱敏后的完整正文                                 |

Token、Password、Authorization、Secret、Wi-Fi Key 等已知键名和常见赋值格式会递归脱敏；事件生成和落盘前各执行一次。自动脱敏无法可靠识别设备私有协议中的位置参数，例如无法仅凭通用规则判断 `AT+LOGIN="user","value"` 的第二个参数是否为密码。处理未知敏感协议时应选择 `none`，或避免把秘密直接写入命令。

## 8. Windows、Linux 与构建

### 8.1 Windows

串口路径通常为 `COM1`、`COM80`。MCP transport 不使用 Windows 专用 IPC；串口仍由原有 serialport backend 打开。当前用户目录下的 AI 配置继承 Windows userData ACL，不额外引入原生 ACL 依赖。

Windows 构建：

```bash
npm run build:win
```

产物包括 `release/win-unpacked` 和 NSIS x64 安装包。

### 8.2 Linux

串口路径通常为 `/dev/ttyUSB*`、`/dev/ttyACM*`。原连接链路会保留 Linux `EACCES` 错误码；用户从 GUI 打开串口时，界面可以调用现有 `pkexec` 权限修复入口。权限修复不属于 MCP Tool，AI 遇到 `EACCES` 时只能报告错误并等待用户处理。也可以将当前用户加入设备所属组，常见为 `dialout`，然后重新登录：

```bash
sudo usermod -aG dialout "$USER"
```

Linux 原生构建：

```bash
npm run build:linux
```

该流程按 `electron-builder.yml` 生成 Linux 目标。

Windows 主机可以生成 Linux x64 glibc 的 unpacked 目录和 Debian 包：

```bash
npm run build:linux:cross-win
```

交叉构建流程下载 Linux Electron，选择 serialport 随包提供的 Linux x64 glibc ELF prebuild，移除 Windows `cpu-features` 可选 binding，再使用 Python 标准库生成 Debian `ar` 与 GNU tar 归档。GNU tar 格式避免产生部分旧版 dpkg 无法处理的 PAX `x/g` 扩展头。该命令只承担 Windows → Linux x64 Debian 交叉打包；AppImage、Snap 和其他架构应在对应 Linux 环境中构建验证。

## 9. 故障定位

| 现象或错误                                 | 处理方式                                                                          |
| ------------------------------------------ | --------------------------------------------------------------------------------- |
| 页面为 `disabled`                          | 开启当前实例的桥梁                                                                |
| `port_conflict`                            | 释放占用进程，或修改基础端口/实例独立端口并重新复制配置                           |
| `401 AUTH_REQUIRED/AUTH_FAILED`            | 检查 Bearer Token；Token 轮换后替换旧配置                                         |
| `403 INVALID_HOST`                         | URL 必须使用复制配置中的 `127.0.0.1:<port>`                                       |
| `403 ORIGIN_NOT_ALLOWED`                   | 不要从浏览器页面调用；使用本地 MCP Client                                         |
| `404 MCP_SESSION_NOT_FOUND`                | MCP session 已关闭、过期或因 Token 轮换失效，客户端需要重新 initialize            |
| `AI_READ_ONLY`                             | 由用户在当前应用运行期间手动选择“完全控制”                                        |
| `CAPABILITY_DISABLED`                      | 在能力边界中开启对应能力组                                                        |
| `SESSION_NOT_FOUND`                        | 重新调用 `session_list`，使用当前存在的运行连接 ID                                |
| `SESSION_WRITE_LOCKED`                     | 另一写入方持有租约；同一工作流应传入此前返回的 `writeLeaseId`，否则等待释放或过期 |
| `429 RATE_LIMITED`                         | 当前 MCP session 调用过密；降低轮询频率，优先使用有界等待 Tool                    |
| `CLOSE_USER_CONNECTION_DENIED`             | 默认来源保护生效；确需关闭时由用户开启页面开关                                    |
| `CONFIG_CONFLICT/CONFIG_REVISION_CONFLICT` | 重新读取最新 revision 后再提交修改                                                |
| `LOG_READ_FAILED`                          | 当前运行连接没有日志文件，或日志存储尚未产生数据                                  |
| `INTERNAL_ERROR`                           | 查看本机应用日志；MCP 响应不会包含内部异常细节                                    |

## 10. 当前验证状态

### 10.1 自动化与构建

当前工作树的自动化结果：

| 验证项                                         | 状态                   |
| ---------------------------------------------- | ---------------------- |
| Node 与 Vue/Web typecheck                      | 通过                   |
| 单元测试                                       | 82 个文件、1211 项通过 |
| MCP/连接集成测试                               | 7 个文件、57 项通过    |
| Electron E2E                                   | 15 项通过              |
| 主进程 AI/MCP、共享服务和交叉打包脚本定向 ESLint | 0 error、0 warning     |
| Windows unpacked COM80、Telnet/FTP、跨 Session | 通过                   |
| Windows 安装包和 Linux x64 Debian 包构建       | 通过                   |
| Linux Debian 归档 ELF、GNU tar 与无 PAX 头检查 | 通过                   |

自动化覆盖官方 SDK loopback、HTTP 安全、Registry 完整性、严格 input/output schema 登记、通用结果映射、未知异常脱敏、双 Client 写租约、GUI/MCP 同队列、命令设置同步、连接 generation、Direct/FTP/Worker 延迟回调、完整 RX 链路压力、活动日志三级策略和 Electron 页面交互。正式 32 项 Tool 的每一条真实宿主成功/失败分支尚未全部通过端到端调用覆盖。

### 10.2 双平台实机证据

Windows 和 Linux 已经完成以下常规核心流程的实机回归：

- 软件重启后 AI 权限恢复为只读；
- “一键复制 MCP 配置”可以重新连接；
- 真实串口可以打开、发送、读取和关闭；
- 重新生成 MCP Token 后旧连接失效；
- 中英文界面及页面、页签 AI 连接状态点同步；
- AI 创建的 COM、FTP、Telnet 标签可以正常关闭；
- 应用退出后没有残留进程、监听端口和自动重连；
- Linux Debian 包可以由 `apt install` 正常解包、安装和运行，未出现 PAX 归档兼容错误。

当前工作树包含更严格的连接 generation、backend 对象身份、RX 热路径和 Tool 输出校验；这些路径已经通过自动化和双平台构建，最新安装包的最终人工回归仍在进行中。上述实机记录说明核心工作流具备双平台证据，不替代对当前安装包的最终发布验收。

Windows 还完成了 32180/32181 多实例隔离、Token 连续轮换、固定端口冲突与运行时恢复、HTTP 边界、20 分钟 8972 次 MCP 调用长稳，以及 COM80 三分钟持续 RX 观察。持续 RX 期间 GUI、MCP 和业务连接保持可用；全局 dropped 计数证明保留窗口发生过容量淘汰，但按第 3.4 节定义，不能据此认定同等数量的未读事件实际丢失。

Linux 安装包还完成了三个独立 MCP Client 的写租约隔离与凭证复用、Telnet/FTP 实际通信、命令组和预设命令 CRUD、业务配置修改恢复、AI 安全配置越权拒绝、HTTP 边界与清理复核。该轮环境没有可用真实串口，真实 tty、10 分钟 soak、Token 轮换和端口占用重启按前置条件跳过，不计为失败。

### 10.3 发布前待验收项

仍需在正式发布前由维护者确认：

- 最新 Windows/Linux 安装包在目标系统时区下的活动历史显示；
- Linux 最新安装包的真实 tty 打开、收发、关闭以及长时间高吞吐；
- 另一普通 Windows 用户读取 `ai-bridge.json` 的 ACL 验收；
- Linux 的 Token 轮换、端口占用重启和多实例端口递增；
- macOS 构建、签名和实机行为。

全项目 ESLint 尚未形成 clean baseline；AI/MCP、共享服务层和交叉打包脚本使用独立定向检查保持 clean。该状态不替代后续全库代码规范治理。

### 10.4 成功与失败结果契约

Registry 中每个 Tool 的专用 output schema 只负责校验成功结果；MCP Adapter 对外公布时，把该成功 data schema 与统一 `{ data: { error } }` schema 合并在同一个根对象中。这样既保留每个 Tool 的严格成功结构，也允许已经执行 `tools/list` 并缓存 output validator 的官方 MCP Client 正常解析 `CONFIG_SCOPE_DENIED`、`SESSION_WRITE_LOCKED`、`AI_READ_ONLY` 等失败结果，不会把业务拒绝替换为 `-32602` schema 错误。内部未知异常仍先映射和脱敏，再进入同一失败契约。

## 11. 扩展约束

后续增加或修改 MCP 能力时保持以下约束：

1. Tool 必须通过 `AiOperationRegistry` 注册，并同时声明明确且受控的 input/output schema、能力组、读写级别、annotations、deadline 和错误码；
2. MCP SDK、Express、HTTP 和 session transport 代码只进入 `adapters/mcp`；
3. Application Core 通过 Ports 调用宿主业务，不直接 import Electron IPC、Vue、serialport 或平台 API；
4. GUI 与 MCP 必须复用 `ConnectionService`、`ConfigService`、`RuntimeEventHub`、`CommandScheduler` 和命令准备逻辑；
5. AI 交互桥梁自身的安全配置不得加入 MCP `config_patch` 白名单；
6. 新的异步 backend 回调必须携带 lifecycle generation，并校验当前对象身份；
7. RX 生产路径不得执行 transport 写入、无界缓存或同步大对象序列化；
8. 新 Tool 需要补充契约、权限、错误、并发、取消、结果上限和活动日志测试；
9. Windows 与 Linux 使用同一 Tool 契约，平台差异留在宿主 Adapter 和构建层；
10. Resources、Prompts、新 transport 或远程监听属于独立安全设计，不与普通 Tool 增量混入同一变更。
11. 跨 MCP session 的长业务所有权必须使用服务端签发的 `writeLeaseId` 等不透明凭证，不得使用 Client 名称、版本或短生命周期 transport session 代替稳定授权。
