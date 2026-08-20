# SuperConnectX AI 交互桥梁

> 分支：`feature/ai-control-bridge`  
> 基线：`5519ad2`（已包含 upstream PR #254）  
> 文档快照：2026-08-20

AI 交互桥梁是 SuperConnectX 的可选附属功能。它允许本机 AI 客户端接入用户已经运行的 SuperConnectX 实例，复用该实例的串口会话、终端日志、命令库和配置。串口工具仍是产品主体；桥梁增加的是受控、可关闭、具备本地操作追溯能力的本机访问入口。

## 目录

- [1. 功能与使用流程](#1-功能与使用流程)
  - [1.1 GUI 可见性与用户并发操作](#11-gui-可见性与用户并发操作)
  - [1.2 核心能力](#12-核心能力)
  - [1.3 功能边界](#13-功能边界)
- [2. AI 使用指南](#2-ai-使用指南)
  - [2.1 当前 Windows 接入](#21-当前-windows-接入)
  - [2.2 日志读取边界与资源保护](#22-日志读取边界与资源保护)
  - [2.3 发送与设备响应](#23-发送与设备响应)
- [3. 关键业务规则与技术实现](#3-关键业务规则与技术实现)
  - [3.1 会话、配置与权限](#31-会话配置与权限)
  - [3.2 通信与安全边界](#32-通信与安全边界)
  - [3.3 架构与依赖方向](#33-架构与依赖方向)
- [4. 合并指南](#4-合并指南)
  - [4.1 当前上游兼容状态](#41-当前上游兼容状态)
  - [4.2 本次 PR 的合并审查重点](#42-本次-pr-的合并审查重点)
- [5. 未来计划](#5-未来计划)
  - [5.1 SDK、CLI 与 MCP 层级](#51-sdkcli-与-mcp-层级)
  - [5.2 Linux 与 macOS](#52-linux-与-macos)
  - [5.3 后续工程项](#53-后续工程项)
- [6. 当前实现与验证](#6-当前实现与验证)
  - [6.1 已实现](#61-已实现)
  - [6.2 自动与人工验证](#62-自动与人工验证)
  - [6.3 合并审查清单](#63-合并审查清单)
- [AI 阅读专用：开发决策记录](#ai-阅读专用开发决策记录)

## 1. 功能与使用流程

用户在 `设置 → AI 交互桥梁` 中选择只读或完全控制权限，并开启总开关。“一键接管”会生成双语接入提示词；AI 完成认证和 `client_hello` 握手并保持连接后，灰色指示灯变为在线状态。多个客户端同时接入时显示数量，断开后自动更新。

桥梁关闭时，状态读取和控制请求都被拒绝；权限级别仍可预先配置。只读模式允许查询、日志读取、事件订阅和只读会话绑定；完全控制额外允许连接、发送、目录维护和配置修改。

AI 操作通过终端中的 `AI SEND`、临时操作浮窗、设置页中的只读操作历史及本地操作记录文件向用户公开。默认记录目录为 `userData/app-logs/ai-activity`；用户也可以在设置页指定其他根目录，软件仍会在其下创建独立的 `ai-activity` 子目录。

### 1.1 GUI 可见性与用户并发操作

| AI 操作            | 软件内部路径                               | 用户可见结果                            |
| ------------------ | ------------------------------------------ | --------------------------------------- |
| 枚举串口           | 当前实例的串口枚举服务                     | 不打开端口，不创建标签                  |
| 绑定会话           | 绑定窗口中已有会话                         | 不切换活动标签，不抢占输入焦点          |
| 启动保存连接       | 保存的连接档案进入原连接 backend           | 创建可见标签；同一 COM 已连接时复用会话 |
| 启动系统串口       | 实时枚举结果匹配后进入原连接 backend       | 端口不存在时拒绝连接；成功后创建可见 AI 标签 |
| 发送命令           | 应用当前换行、HEX、CRC 和显示规则          | 对应终端追加 `AI SEND` 或失败记录       |
| 修改配置           | schema、revision、持久化及运行时应用处理器 | 用户打开相应界面时看到最新值            |
| 维护连接和命令目录 | 原 Storage 实例                            | 刷新目录，不切换用户当前命令组；连接档案写入遵循 GUI 类型边界 |

AI 不模拟鼠标、键盘、焦点和页面跳转。切换活动标签或当前命令组会与用户争抢操作上下文，因此控制直接调用共享业务服务，再用状态事件刷新 GUI。串口连接属于例外：COM 是独占资源，AI 新建连接必须创建可见标签，不能在后台隐形占用端口。

### 1.2 核心能力

| 能力               | 只读     | 完全控制   | 协议方法                                                                  |
| ------------------ | -------- | ---------- | ------------------------------------------------------------------------- |
| 桥梁状态和权限     | 可用     | 可用       | `get_info`、`get_capabilities`、`client_hello`                            |
| 会话和近期终端事件 | 可用     | 可用       | `list_sessions`、`read_events`、`read_buffer`、`subscribe`、`unsubscribe` |
| 有界日志尾读与搜索 | 可用     | 可用       | `read_log_tail`、`search_log`                                             |
| 绑定现有会话       | 只读绑定 | 读写绑定   | `attach_session`、`detach_session`                                        |
| 启动或停止会话     | 不可用   | 可用       | `start_session`、`start_port_session`、`stop_session`                     |
| 发送终端命令       | 不可用   | 可用       | `send`                                                                    |
| 枚举串口           | 可用     | 可用       | `list_serial_ports`                                                       |
| 连接档案           | 仅查询   | 查询和维护 | `list_connections` 及对应 CRUD（写入仅限 GUI 已开放的 Telnet/FTP）          |
| 命令组与预设命令   | 仅查询   | 查询和维护 | `list_command_groups`、`list_preset_commands` 及对应 CRUD                 |
| 软件与 COM 设置    | 只读     | 可读写     | `describe_config`、`get_config`、`patch_config`                           |

[`AiBridgeCapabilities.ts`](../src/shared/extensions/ai-control-bridge/AiBridgeCapabilities.ts) 是方法、读写级别和设置页能力清单的唯一登记源。

`list_connections` 查询已保存的连接档案，不表示端口当前存在，也不表示档案已经建立运行会话。`create_connection` 和 `update_connection` 只允许当前 GUI 保存连接对话框公开的 Telnet、FTP 类型；系统 COM 属于实时枚举资源，不通过 AI 写入保存档案，必须使用 `list_serial_ports` → `start_port_session`。

### 1.3 功能边界

桥梁覆盖“使用 SuperConnectX 与目标机器交流”所需的连接、终端、日志、命令和核心配置。皮肤、字体预览、虚拟串口、帮助、更新、备份恢复、快捷键、语法高亮编辑和日志过滤面板不在 AI 控制面内。

Bootloader、X/Y-Modem、OTA 和批量连接是长事务，不能复用普通 `send`。后续接入时应定义独立 capability/task，以及进度、取消、超时和逐项结果。

## 2. AI 使用指南

### 2.1 当前 Windows 接入

软件已经在 `设置 → AI 交互桥梁` 中提供“一键接管”入口。用户不需要查找 Pipe 名称、token 或手写协议请求，推荐操作如下：

1. 选择“只读”或“完全控制”权限，并开启 AI 交互桥梁。
2. 点击“一键接管”，在弹窗中查看软件生成的双语接入提示词。
3. 点击“一键复制”，将完整提示词发送给具备本机执行能力的 AI。
4. 等待 AI 按提示完成接入。设置页指示灯亮起并显示客户端名称或数量，代表 AI 已完成握手且连接仍然有效。

纯网页聊天产品通常无法访问本机文件或 Named Pipe，复制提示词后仍需要由具备本机工具调用能力的 AI 客户端执行。当前尚未发布官方 SDK、CLI 或 MCP Server；在这些适配器完成前，接入提示词会引导 AI 使用现有 Windows 接口。

AI 收到提示词后，在软件内部完成以下连接流程：

1. 读取 `%APPDATA%/superconnectx/bridge/endpoint.json`；附加实例使用 `endpoint-<instanceIndex>.json`。
2. 连接文件中的 `pipeName`，使用其中的 token 调用 `auth`。
3. 调用 `client_hello` 登记客户端名称，并保持 Pipe 连接。
4. 调用 `get_info` 和 `get_capabilities`，按当前权限选择方法。
5. 查询并绑定现有会话；客户端退出时释放绑定，不关闭用户原有会话。

当用户要求 AI 启动系统端口列表中的串口时，AI 必须使用 `list_serial_ports` 获取本次实时枚举结果，并按返回对象的 `path` 字段匹配目标端口。Windows 下用户只提供数字时可以将 `90` 规范化为 `COM90`；匹配失败返回 `PORT_NOT_FOUND`，不得继续尝试打开。匹配成功后调用 `start_port_session`，传入匹配到的 `portPath` 和用户指定的串口参数。该方法创建软件可见的 AI 会话，复用 `ConnectionService` 和原连接 backend，不创建临时保存配置，也不直接访问串口。若用户要求维护保存连接档案，`create_connection` 和 `update_connection` 仅接受 Telnet/FTP；向其传入 `com` 或尝试把已有档案改成 `com` 时返回 `CONNECTION_TYPE_NOT_EXPOSED`。

三种会话入口的职责保持明确：

- `start_session`：启动已保存的连接配置；
- `start_port_session`：启动当前系统枚举到的、可以等待用户连接的临时串口；
- `attach_session`：绑定已经运行的会话，不重复打开端口。

系统串口启动请求示例：

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "start_port_session",
  "params": {
    "portPath": "COM90",
    "baudRate": 115200
  }
}
```

`COM90` 仅用于展示参数格式，实际端口必须来自本次 `list_serial_ports` 返回的 `path`。扫描完成后端口可能被拔出或被其他程序占用，最终打开仍以原连接 backend 的结果和错误码为准。

endpoint 文件只用于实例发现和认证，不是状态快照，也不是日志。所有实时状态都应按需请求，变化通过带 sequence 的事件读取或订阅。

### 2.2 日志读取边界与资源保护

串口可能持续产生海量日志。桥梁在服务端限制 RX 的采集条件、内存占用和单次返回量，因此任何客户端都无法通过一次请求取走完整的大型日志，也无法用一个慢速订阅阻塞软件的串口接收。限制由主进程执行，不依赖 AI 是否理解或遵守提示词。

| 范围                |         默认值 | 最大值或行为                         |
| ------------------- | -------------: | ------------------------------------ |
| 运行时事件数量      |         512 条 | 超出后淘汰最旧事件                   |
| 全局运行时事件内存  |          8 MiB | 超出后有界淘汰                       |
| 单会话 RX 内存      |          2 MiB | 超出后淘汰该会话最旧 RX              |
| 单次事件批次        |         64 KiB | 最大 128 KiB                         |
| 单条入站 NDJSON 帧  |              — | 1 MiB                                |
| 单条出站响应        |              — | 1 MiB，超出返回 `RESPONSE_TOO_LARGE` |
| 单客户端待发送队列  |              — | 1 MiB                                |
| 日志尾读            | 32 KiB、200 行 | 64 KiB、1000 行                      |
| 日志搜索扫描        |        512 KiB | 最大 2 MiB                           |
| 日志搜索结果        |              — | 最大 64 KiB、100 个匹配              |
| AI 活动日志待写队列 |              — | 1 MiB，超出后丢弃并记录警告          |
| AI 活动日志单文件   |         10 MiB | 设置页可配置 1–100 MiB               |
| AI 活动日志文件数   |           5 个 | 设置页可配置 1–10 个，包含当前文件   |
| AI 活动历史读取     |              — | 最多扫描当前文件及备份尾部 1 MiB     |

RX 采用按需采集：只有会话被 AI 绑定，或 RX 订阅明确指定 `eventTypes` 和 `sessionIds` 时，才复制 GUI 已处理的 RX 到桥梁缓存。最后一个采集引用释放后立即清理该会话 RX；关闭桥梁时清理全部桥梁 RX。GUI 接收、渲染和软件连接日志继续走原路径。桥梁关闭且无人使用时，不为 AI 保留 RX 副本。

`read_events` 和 `read_buffer` 只返回有界事件批次，并携带 `nextCursor`。`truncated` 表示请求游标早于最老事件，或本批次受到数量、字节上限限制；超大的单条 RX 会标记 `dataTruncated`。`droppedEvents` 和 `droppedBytes` 是进程内因缓存淘汰或超限产生的累计统计。客户端即使没有实现正确的增量读取，也只能得到受限响应，不能要求服务端返回无限缓存。

`read_log_tail` 只读取连接日志尾部的有限字节和行数；`search_log` 只扫描有限文件区间并限制匹配数量及结果字节数。两者都不会把整份日志加载到主进程内存。日志文件仍由原 `ProtocolLogger` 写入和维护，桥梁只提供有界读取入口。

慢客户端不会阻塞串口接收：`socket.write()` 产生背压后暂停继续写入；RX 推送进入有界队列，队列满时丢弃 RX 并汇总为 `stream.gap`。控制响应不能静默丢弃；队列无法容纳时关闭该异常客户端。

AI 操作记录采用异步批量写入，不在请求处理路径中同步执行磁盘 I/O。活动文件名为 `ai-activity-current.log`；达到设置页配置的单文件上限后，轮转为 `ai-activity-YYYYMMDD-HHmmssSSS.log`。毫秒时间戳同时表达轮转时刻和文件先后顺序；同一毫秒发生重名时追加三位序号。超过保留数量时删除时间最早的归档。设置页读取操作历史时只读取当前文件及最新归档的尾部，总扫描量不超过 1 MiB。

设置项 `aiActivityLogPath` 表示本地操作记录根目录。空值使用软件运行日志所在的 `userData/app-logs`，实际记录文件进入其下的 `ai-activity`；自定义根目录同样追加该专属子目录。修改路径后，新记录写入新目录，已经排队的写入仍落到修改前的目标，避免切换瞬间把同一批记录拆错位置。

桥梁能够限制软件保留和返回的数据量，不能直接控制外部 AI 产品如何组织提示词、重复调用多少次接口，或把返回内容发送给哪种模型。因此这里保证的是“单次响应和运行时资源有硬上限”，而不是宣称软件能够精确限制第三方模型的 token 消耗。未来官方 SDK、CLI 和 MCP 会在这层硬限制之上增加客户端侧的增量读取、过滤和上下文预算。

### 2.3 发送与设备响应

`send` 只接受文本，使用共享 [`CommandPreparation.ts`](../src/shared/serial/CommandPreparation.ts) 应用当前自动换行、HEX、CRC 和显示规则，再由 `ConnectionService` 进入原 backend。协议不提供绕过软件规则的原始串口写入口。

`tx.accepted` 和终端中的 `AI SEND` 只证明软件接受并执行了发送路径。设备是否收到、执行并返回结果，需要 RX 或真实硬件验证；设备离线时仍可验证软件发送链路。

## 3. 关键业务规则与技术实现

### 3.1 会话、配置与权限

`attach_session` 默认建立只读绑定；`mode=write` 需要完全控制。客户端断开或 `detach_session` 只释放自身绑定和 RX 缓存引用，不关闭用户会话。AI 通过 `start_session` 启动已保存连接配置，或通过 `start_port_session` 启动实时枚举到的系统串口；两条路径都会先查找同一端口的现有会话，存在则复用，不存在才通过原 backend 打开并通知 GUI 创建标签。

`ConfigService` 为 GUI 和扩展统一提供 schema、当前值、revision、类型校验与应用结果。通用配置方法只开放 `settings` 和 `com-settings`；连接档案、命令组和预设命令分别使用专用查询及 CRUD 接口，避免通过 `patch_config` 绕过连接类型和业务校验。连接档案写入仅限 GUI 已开放的 Telnet/FTP，实时系统串口不写入 `connections`。`expectedRevision` 防止 AI 覆盖用户刚完成的修改；`effectiveNow`、`requiresReconnect` 和 `requiresRestart` 描述软件应用状态，不伪造设备响应。

命令输入框、活动标签和当前命令组属于用户上下文，不是 AI 可写配置。浮窗位置、透明度、点击行为和停留时间属于用户反馈偏好，也只由用户配置。

### 3.2 通信与安全边界

Windows 桥梁运行在当前 Electron/Node.js 主进程中，使用 Node 内置 `net` 创建本机 Named Pipe。消息采用 UTF-8、JSON-RPC 2.0 和 NDJSON；没有 HTTP、WebSocket 或公网监听。

启动时生成实例 UUID、PID、实例索引、Pipe 名称和 32 字节随机 token。主实例与显式附加实例使用独立 endpoint 文件，退出时只清理自己的文件。token 使用常量时间比较；`SCX_BRIDGE_DISABLED=1` 可禁止监听。

桥梁沿用应用进程的用户权限，不提权、不启动高权限子进程，不使用 OCR、截图、全局鼠标或键盘自动化，也不会控制其他软件。AI 专属实现使用 Node 内置模块，没有新增 AI 专用第三方运行时依赖。

### 3.3 架构与依赖方向

```text
AI client（当前自定义客户端；未来 CLI / MCP）
  └─ JSON-RPC 2.0 / NDJSON
      └─ AiBridgeServer + AiBridgePolicy
          └─ AiBridgeHost
              ├─ ConnectionService ─ IpcConnector ─ 原连接 backend
              ├─ ConfigService ─ IpcStorage ─ 原 Storage
              ├─ CoreCatalog ─ 连接与命令目录
              ├─ AiBridgeLogReader ─ ProtocolLogger 连接日志
              └─ RuntimeEventHub ─ GUI、订阅和活动历史
```

AI 专属策略、协议和日志位于 `src/main/extensions/ai-control-bridge`；GUI 与扩展共用的连接、配置和事件能力位于 `src/main/services`；公共命令准备位于 `src/shared/serial`。`AiBridgeServer` 不直接依赖 Electron、serialport、具体 Storage 或 Vue。

| 原模块                   | 调整                                           | 保留的兼容面                   |
| ------------------------ | ---------------------------------------------- | ------------------------------ |
| `IpcConnector`           | GUI IPC 与桥梁共用 `ConnectionService` backend | 原 GUI 通道和参数保留          |
| `IpcStorage`             | 注册配置 adapter、目录端口和 GUI 变更事件      | 原 Storage 格式和 IPC 保留     |
| `ConnectionStateManager` | 仅在需要时发布 GUI 已处理的 RX                 | 原接收、GUI 推送和日志路径保留 |
| `UnifiedTerminal`        | 使用公共命令准备函数                           | 原发送交互保留                 |
| preload/renderer         | 增加类型化桥梁事件与活动历史                   | 其他页面入口不变               |

## 4. 合并指南

### 4.1 当前上游兼容状态

本分支已经以 `upstream/master@5519ad2` 为基线，该提交包含 PR #254“Linux 串口权限修复与打包完善”。PR #254 的安装脚本、udev 规则、打包配置、`IpcSerialPort` 权限修复入口和 `ComClient` 错误识别均属于上游基线，不会作为本 PR 的新增内容再次出现。

AI 桥梁与上游共同涉及 `ComTerminal.vue`、preload API、renderer 类型声明和双语资源。当前工作区已经同时保留两组行为：

- `ComTerminal.vue` 保留 `EACCES` 判断、`offerSerialPermissionFix` 和 Linux 权限提示，同时增加 AI 会话状态、运行时配置同步和 `AI SEND` 展示；
- preload 和 renderer 类型同时包含 `fixSerialPermissions` 与桥梁事件、活动历史和客户端状态接口；
- 中英文资源同时包含 Linux 权限修复和 AI 交互桥梁文案；
- `electron-builder.yml`、`IpcSerialPort.ts`、`ComClient.ts` 和 `build/installer/*.sh` 保持上游实现，本 PR 不再修改这些文件。

串口打开错误发生在 `ComClient.start()` 返回的 Promise 中，并通过 `reject()` 传递。GUI 连接经过新增的 `ConnectionService` 后，如果共享服务只把异常转换为通用消息，就会丢失 PR #254 用于界面判断的 `EACCES`。当前实现已在 `ConnectionService` 的异常转换边界保留字符串 `code`，并由单元测试覆盖 backend reject、返回结果和运行时错误事件三处数据。最终链路为：

```text
ComClient reject(Error + EACCES)
  → DirectConnector
  → ConnectionService { success: false, message, code: 'EACCES' }
  → start-connect IPC
  → ComTerminal.offerSerialPermissionFix()
```

### 4.2 本次 PR 的合并审查重点

维护者审阅本 PR 时只需比较 `upstream/master...feature/ai-control-bridge`。PR #254 已经是共同基线，不需要重新处理或选择两次 PR 的实现。需要重点确认：

1. `ConnectionService` 复用原 backend，并在失败时保留受控的字符串错误码；不会返回完整 Error、堆栈或任意异常字段。
2. GUI 的 `start-connect`、`send-data`、`stop-connect` 和 `update-connect` 仍通过原 `IpcConnector` 路由；桥梁没有直接打开串口。
3. `ComTerminal.vue` 中 Linux 权限修复、普通 GUI 连接和 AI 可见会话三条路径可以并存，且监听器在卸载时释放。
4. preload 的实际暴露项与 `index.d.ts`、`env.d.ts` 一致，中英文 locale key 保持对齐。
5. 同一 COM 会话复用、AI 创建连接的可见标签、`AI SEND`、detach 不关闭用户会话以及有界 RX 不影响 GUI 接收。

自动检查应至少包括类型检查、locale 测试、`ConnectionService` 错误码测试、AI 桥梁单元/集成测试和 Electron E2E。Linux `pkexec`、udev 与真实串口权限提示仍需在 Linux 环境验收；Windows 测试只能确认共享服务和 renderer 之前的数据链路。

## 5. 未来计划

### 5.1 SDK、CLI 与 MCP 层级

```text
Codex / Claude Code / 自动化脚本 / MCP Host
  ├─ scx-bridge-cli
  └─ superconnectx-mcp
       ↓
scx-bridge-client SDK
       ↓
JSON-RPC 2.0 / NDJSON
       ↓
Windows Named Pipe / Linux 与 macOS Unix Domain Socket
       ↓
SuperConnectX 当前实例与共享业务服务
```

Named Pipe、Unix Domain Socket、NDJSON 和 JSON-RPC 是底层传输与协议；SDK 抽象实例发现、认证、请求关联、重连、cursor、背压和错误类型。CLI 与 MCP 是 SDK 之上的两种入口，不替代底层 IPC，也不与其互斥。

- `scx-bridge-client SDK`：先实现，作为协议的唯一客户端实现并提供稳定类型。
- `scx-bridge-cli`：面向 Codex、Claude Code、脚本和 CI，提供结构化输出、退出码、超时和日志过滤。
- `superconnectx-mcp`：把同一 SDK 包装成 MCP tools/resources，提供能力发现和参数 schema。

实际路线为 SDK → CLI → MCP。完成后设置页优先引导用户安装适配器，不再要求 AI 临时编写 Named Pipe 脚本。

### 5.2 Linux 与 macOS

当前 AI 交互桥梁仅支持 Windows。Linux/macOS 构建不会启动桥梁 transport；软件本体的跨平台能力仍由原项目维护。当前 Windows Pipe 名称不会在非 Windows 平台被误当作 Unix Socket 路径监听。

未来保持业务和协议层不变，增加平行的 transport/discovery：

- Windows：Named Pipe + `%APPDATA%` endpoint；
- Linux：`$XDG_RUNTIME_DIR/superconnectx/` 下仅当前用户可访问的 Unix Domain Socket；
- macOS：用户临时目录中的短路径 Unix Domain Socket，避免路径长度限制；
- SDK：根据 endpoint 的 transport 字段自动选择 Pipe 或 Unix Socket，向 CLI/MCP 隐藏平台差异。

Linux 还需验证 endpoint 权限、socket 清理、多实例、AppImage/deb/rpm 和串口组权限；macOS 需验证签名、公证、沙箱和临时目录生命周期。

### 5.3 后续工程项

- 为日志错误增加 `LOG_NOT_FOUND`、`LOG_QUERY_INVALID`、`LOG_READ_FAILED` 等稳定错误码。
- 将事件数组淘汰替换为真正的环形缓冲，降低持续高吞吐时的数组搬移成本。
- 增加协议版本协商、SDK 兼容矩阵和 CLI/MCP 端到端测试。
- 为长事务建立 task capability，不扩大普通 `send` 的语义。

## 6. 当前实现与验证

### 6.1 已实现

- 总开关、只读/完全控制权限、状态显示和能力总表。
- 双语一键接管提示、在线指示、多客户端计数和持续连接握手。
- Windows Named Pipe、token 认证、有界请求响应及慢客户端背压。
- 会话绑定、可见 AI 连接标签、同 COM 复用、保存连接启动、动态系统串口启动、连接停止和软件路径发送。
- 连接档案、命令组、预设命令和核心配置的受控查询与维护；连接档案写入仅开放 GUI 可创建/编辑的 Telnet、FTP 类型，系统串口不写入保存档案。
- revision 冲突、类型/范围校验、运行时应用结果和 GUI 刷新。
- 按需 RX、字节上限、cursor/gap/droppedBytes、日志尾读与搜索。
- 双语设置页、操作浮窗、活动历史、可配置独立目录的时间戳轮转本地操作日志和多实例 endpoint。
- 非 Windows 平台桥梁 transport 禁用门控。

### 6.2 自动与人工验证

| 检查                              | 最终结果                                      |
| --------------------------------- | --------------------------------------------- |
| `npm.cmd run typecheck`           | Node 与 Vue 类型检查通过                      |
| AI 桥梁、共享服务与双语资源定向测试 | 5 个测试文件、19 项测试通过                  |
| `npm.cmd test`                    | 1152 项通过、3 项失败；失败均为基线 `PrintAppInfo` 环境问题 |
| `npm.cmd run test:integration`    | 2 个测试文件、38 项测试通过                   |
| `npm.cmd run build:unpack:timestamped` | 六次 unpack 构建成功；包含类型检查和 `electron-vite build` |
| COM80 Named Pipe 实测             | 两轮动态枚举、启动、发送 `ls`、读取 RX、关闭均通过 |
| `session.state` / `session.closed` | 两轮均为 `starting → connected`，关闭事件已收到 |

首轮产物为 `release/ai-bridge-20260820-230305623/win-unpacked/SuperConnectX.exe`。应用在清除测试终端继承的 `ELECTRON_RUN_AS_NODE=1` 后，以用户权限启动；受限沙箱启动曾因用户数据目录不可写而出现 `EPERM`，该过程没有进入 COM 连接，不属于应用连接逻辑。

通过当前实例的 Named Pipe 完成了以下链路：

1. `auth`、`client_hello`、`get_info` 和 `get_capabilities` 成功，实例 PID 为 `17260`，权限为完全控制。
2. `list_serial_ports` 返回 `COM1`、`COM80`；根据返回的 `path` 匹配 `COM80` 后调用 `start_port_session`，没有创建或新增保存连接档案。
3. 运行会话进入 `starting` 和 `connected`，事件来源为 `ai`；渲染进程现有事件处理器据此创建 AI 标签页，`session.closed` 分支调用 `removeAiSessionTab` 清理对应标签。
4. 绑定写入会话并发送 `ls`，终端 RX 收到目录列表和 `/ #` shell prompt；`tx.accepted` 仅作为软件发送成功信号，设备响应由 `rx.display` 确认。
5. `stop_session` 成功，收到 `session.closed`，最终 `list_sessions` 返回 0 个会话；保存连接 ID 前后保持不变。

进程级验证确认打包程序窗口进程保持响应，Named Pipe 在会话关闭后仍由软件实例持有。当前自动化环境没有桌面截图采集能力，因此 AI 标签“创建/移除”按 renderer 事件链和会话结果验证；人工验收时应同时观察标签页在启动后出现、关闭后消失。

历史基线检查中，`PrintAppInfo.test.ts` 的 `uv_os_get_passwd returned ENOMEM` 属于基线环境问题，`PrintAppInfo.ts` 与 AI 桥梁无关，本次不处理。Electron E2E 运行时必须清除 `ELECTRON_RUN_AS_NODE=1`，否则 Electron 会按 Node 模式启动，不能代表应用行为。

第二轮实测产物为 `release/ai-bridge-20260820-231128114/win-unpacked/SuperConnectX.exe`，重新执行同一套 Named Pipe 验证并通过：实例 PID 为 `33748`，在线客户端握手成功，11 组能力可用；`list_serial_ports` 返回 `COM1`、`COM80`，按 `path` 匹配后启动 `COM80`，`ls` 收到目录列表和 `/ #`，关闭后收到 `session.closed` 且会话数为 0。两轮测试均未改变保存连接配置。后续文案及配置边界调整生成了若干验收包；移除 i18n 会误判为 HTML 的尖括号表达后，基于最终代码生成 `release/ai-bridge-20260820-234646789/win-unpacked/SuperConnectX.exe`。后续构建未重复占用 COM80。六次构建均出现 electron-builder 的既有依赖解析和 `rcedit` 重试警告，但最终退出码为 0；最终产物包含配置旁路修复和最新双语提示词，前两次产物完成了真实 COM80 验收。

`npm run build:unpack:timestamped` 由 `scripts/build-unpack.mjs` 生成 `release/ai-bridge-YYYYMMDD-HHmmssSSS/win-unpacked`。它只服务开发验收产物，不替换原 `build:unpack`、`build`、`build:win`、`build:linux` 或 `build:mac`。

### 6.3 合并审查清单

- AI 专属代码保持在 `extensions/ai-control-bridge`；公共 service 必须同时服务 GUI 和扩展。
- 新方法同时登记 capability、读写级别、协议分发、双语说明和权限测试。
- 系统串口启动必须先复用 `list_serial_ports` 的实时结果；`start_port_session` 不得接受未枚举端口，也不得退化为创建测试保存配置。
- `start_session` 仅通过已保存连接配置启动运行会话；`create_connection`/`update_connection` 不得创建或改写 GUI 未开放的 `com` 保存档案，违反时返回 `CONNECTION_TYPE_NOT_EXPOSED`。
- 不直接调用 serialport，不创建隐形 COM，不提供绕过软件规则的原始发送。
- 密码与 token 不进入响应、浮窗、活动历史或普通日志。
- GUI 与 AI 并发时不抢活动标签、输入焦点和当前命令组。
- 高吞吐验证覆盖内存/响应上限、cursor、gap 恢复和慢客户端隔离。
- Linux 串口 `EACCES` 必须经过 `ConnectionService` 保留，并继续触发原权限修复入口。

## AI 阅读专用：开发决策记录

本节保存开发过程中的关键事实，供后续 AI 恢复上下文；功能审查以正文为准。

### A-001：附属功能目录

早期代码曾分散在顶层 `application`、`bridge` 和 `services`。当前将 AI 专属策略、协议与活动日志归入 `extensions/ai-control-bridge`，仅把 GUI 与扩展真正共用的连接、配置和事件服务放在项目级 `services`。

### A-002：endpoint 与 GUI 模拟

endpoint 只解决实例发现和认证。实时值按需请求，变化由 sequence、有界事件和订阅传递，本地操作历史单独落盘。AI 不切换当前标签或命令组；占用独占资源的连接操作必须创建可见标签。

### A-003：COM80 隐形连接问题

早期测试曾在后台打开 COM80，随后用户从 GUI 连接时得到 `Opening COM80: Access denied`。规则由此确定：同一端口先复用现有会话，新连接必须显示在 GUI，客户端 detach 不关闭用户会话。已保存档案使用 `start_session`；系统枚举端口使用 `list_serial_ports` → `start_port_session`，不创建临时 COM 档案，端口号不写死在协议实现中。

### A-004：发送与配置结果

发送链路为 `prepareCommand → ConnectionService → 原 backend → TX event → AI SEND`。持久化成功、当前会话生效和设备响应分别判断；`effectiveNow` 和 reconnect/restart 只描述软件状态。

### A-005：浮窗、事件与日志

浮窗负责短期反馈，运行时事件负责实时同步，活动日志负责本地操作追溯，连接日志负责设备通信历史。四者职责不同，均不能作为无限 AI 上下文。

### A-006：Vue i18n 提示词

语言包中的 `{...}` 会被 Vue i18n 当作插值。接入提示词曾包含 JSON 对象，导致界面为空且复制结果为 `undefined`。语言包现用字段文字描述，原始 JSON 示例留在开发文档和客户端实现中。

### A-007：RX 内存与 token 风险

原 GUI 支持持续海量日志；AI RX 副本会额外消耗内存并放大 token。当前采用按需采集、事件/字节双上限、响应上限、socket 背压、增量 cursor、gap 统计、尾读和搜索。桥梁关闭或最后一个采集引用释放后清理 RX 副本。
