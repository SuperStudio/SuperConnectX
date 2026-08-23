# Core

Electron 主进程通用基础设施。该层仅依赖 Electron、Node.js 与通用第三方库，**不得**依赖 `src/main/protocol`、`src/main/workers`、`src/main/entity` 或渲染进程业务页面。

## 模块职责

- `paths`：应用数据目录、多实例隔离、迁移与测试目录覆盖。
- `logging`：主进程日志与渲染进程日志桥接。
- `window`：窗口创建、窗口生命周期和窗口控制 IPC。
- `tray`：系统托盘和最小化到托盘。
- `storage`：通用偏好/JSON 数据存储抽象。
- `backup`：备份、恢复及数据转移基础服务。
- `updater`：更新检查、下载、安装及状态事件。
- `ipc`：基础能力的 IPC 注册器。

## 依赖方向

```text
renderer/foundation -> preload -> core
main/features       -> core
core                -/-> main/features
core                -/-> renderer
```

在迁移阶段，旧的 `src/main` 模块可调用 `core`，但不得让 `core` 反向调用旧业务模块。
