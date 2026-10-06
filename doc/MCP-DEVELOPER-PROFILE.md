# 开发者包

开发者包是设备能力的扩展入口。普通用法不用手写 `profile.json`。

## 30 秒开始

```bash
scx-mcp --init
scx-mcp --new template 我的设备, version, status
scx-mcp --new tool 读版本
scx-mcp --doctor
```

`--init` 会创建 `~/.superconnectx/`：

| 目录 | 放什么 | 是否自动变成工具 |
| --- | --- | --- |
| `templates/` | 设备模板 JSON | 否，加载为模板 |
| `resources/` | 寄存器表、协议说明、标定数据 | 否，只登记目录 |
| `scripts/` | 辅助脚本 | 否，只登记目录 |
| `parsers/` | 解析器 `.mjs` | 是，文件名就是工具名 |
| `tools/` | 自定义工具 `.mjs` | 是，文件名就是工具名 |

项目目录下的 `.superconnectx/profile.json` 优先于用户目录。临时测试可以用：

```bash
scx-mcp --new template 我的设备, version, status --dir /tmp/my-device
scx-mcp --doctor --profile /tmp/my-device/profile.json --templates /tmp/my-device/templates
```

## 写模板

最短只写名称和命令：

```json
{
  "name": "我的设备",
  "commands": ["version", "status"]
}
```

命令也可以写发送文本和风险：

```json
{
  "name": "我的设备",
  "commands": ["version version read", { "command": "reboot", "expect": "ok", "risk": "write" }]
}
```

字段会自动补齐：

- `id` 来自文件名。中文文件名会转成合法 id，显示名仍保留中文。
- `version` 默认 `1`。
- `connectionTypes` 默认 `["serial"]`。
- `permissions` 默认只读。
- 字符串命令格式是 `id 发送文本 风险`。省略时发送文本等于 id，风险是 `read`。
- `expect` 会变成等待字面量，超时默认 3000 毫秒。
- `logEvents` 可写成 `"error => 设备报错"`。

完整字段仍然可用：`connectionTypes` 支持 `serial`、`telnet`、`ftp`；`risk` 支持 `read`、`write`、`destructive`、`export`；`lineEnding` 支持 `none`、`LF`、`CR`、`CRLF`。

模板只声明命令、等待条件和日志事件，不执行 Shell、JavaScript 或网络请求。写命令仍受 MCP 写租约和权限模式约束。

## 写工具或解析器

```bash
scx-mcp --new tool 读版本
scx-mcp --new parser 解析日志
```

生成的文件导出一个函数。调用时收到：

```js
export default async function ({ facade, input, component }) {
  const text = await facade.readSession?.(input.sessionId)
  return { text, input }
}
```

- `facade` 是连接后端，可读串口、会话和日志。
- `input` 是 AI 传入的参数。
- `component` 是当前组件信息。
- 返回普通对象即可。

`tools/读版本.mjs` 会注册成 `component_tools_读版本`。`parsers/` 同理。README 不会被当成工具。

## 什么时候改 profile

只有要替换连接后端时才改 `profile.json`，增加一个 `facade` 构件：

```json
{ "id": "my-facade", "type": "facade", "path": "facade.mjs" }
```

模块必须导出 `default` 或 `facade`，并实现 `McpFacade`。

## 检查

`scx-mcp --doctor` 会显示：

- `profile`：实际加载的配置路径
- `components`：目录和自动发现的工具
- `templates`：加载成功的模板数量
- `skippedTemplates`：格式错误的文件和原因

桌面端启动时也会加载同一套用户目录和项目目录。
