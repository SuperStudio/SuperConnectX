# SuperConnectX Foundation Template Guide

> 中文版位于：`基础项目拆分实施计划.md`（步骤 6）。
> 本指南聚焦**复用方式**——如何基于已沉淀的 `foundation/` 层创建一个新的桌面应用。
>
> **可直接运行的完整示例**：`examples/base-desktop-app/`——一个独立可安装、
> 可 `npm run dev` 启动、可打包的 Electron + Vue 3 模板项目，
> 含 foundation 全量源码、IPC 合约演示、防 Proxy 写法与快速启动指南，
> 详见其 `README.md`。

## 1. 适用场景

`foundation/` 抽象了跨业务共用的桌面应用能力：
窗口壳、侧栏与状态栏、主题与国际化、设置中心与序列化保存、
通知中心、工作台 Tab 与分屏布局。

**适合复用**：
- 串口/网络调试工具、SRE 工具、运维面板等"多连接、多窗口、持久化会话"形态；
- 任何需要分屏 + Tab + 通知 + 设置 + 主题的桌面应用。

**不适合复用**：纯单页 UI（如浏览器扩展、轻量编辑器）——直接用 Vite + Vue 即可。

## 2. 复用方式

### 2.1 直接拷贝

最小起步：把 `src/renderer/src/foundation/` 目录复制到目标项目，
删除与业务耦合的部分（IPC 调用、连接相关 types）。

### 2.2 独立包（推荐前提）

当出现第二个复用项目时再拆分为 npm 包或独立仓库——
见实施计划步骤 6 的"根据至少一个新应用的复用情况，再决定拆分为独立仓库或 npm 包"。

## 3. 目录结构与边界

```
src/renderer/src/
├── foundation/   # 跨业务可复用（不要 import features/）
│   ├── workbench/    # Tab、分屏、拖拽
│   ├── shell/        # AppShell、SidebarLayout、NotificationCenter、WindowTitleBar
│   ├── settings/     # SettingsRegistry、SettingsLayout、useSerializedSettingsSave
│   ├── theme/        # useTheme
│   └── i18n/         # 初始化与语言切换
├── features/     # 业务域（不可被 foundation import）
├── components/   # 跨业务 UI 组件（可被 features 引用）
└── App.vue       # 仅做装配：组合子装配 + 模板绑定 + 生命周期接线
```

**硬性边界**：
- `foundation/` 不得 import `features/` 或 `components/`；
- `features/` 之间通过**配置/接口/事件**协作，避免直接相互 import。

## 4. 启动一个新页面（5 步）

### 4.1 注册页面到工作台 Tab

```ts
// features/demo/useDemoFeature.ts
import { useWorkbenchTabs, type TabItem } from '../../foundation/workbench/useWorkbenchTabs'

export function useDemoFeature(comRefs: Record<string, any>, telRefs: Record<string, any>) {
  return useWorkbenchTabs(comRefs, telRefs)
}

// 装配时（App.vue 或宿主组件）：
const { openTab, closeTab, tabs } = useDemoFeature(comRefs, telRefs)
openTab({
  id: 'demo-1',
  name: '演示页',
  connectionType: 'custom',
  sessionId: 'demo-1'
} as TabItem)
```

### 4.2 把页面接入分屏（可选）

```ts
import { useSplitWorkspace } from '../../foundation/workbench/useSplitWorkspace'

const { splitState, splitPanel, removePanel, onTabClosed } = useSplitWorkspace()
// 把当前 tab 从单面板拖入新面板：
splitPanel('panel-0', 'horizontal')
```

### 4.3 注册设置项

```ts
// features/demo/settings.ts
import { SettingsRegistry } from '../../foundation/settings/SettingsRegistry'

export function registerDemoSettings(registry: SettingsRegistry) {
  registry.register({
    key: 'demo',
    getLabel: () => '演示模块',
    order: 50
  })
}

// 宿主（SettingsPage.vue）：
const categories = settingsRegistry.getCategories()
```

### 4.4 发送通知

```ts
import { useNotificationCenter } from '../../foundation/shell/useNotificationCenter'
const { add } = useNotificationCenter()
add('导入完成', '成功导入 12 条连接', 3000)
```

### 4.5 集成主题与国际化

```ts
import { useTheme } from '../../foundation/theme/useTheme'
const { theme, toggleTheme } = useTheme()
```

## 5. 设置持久化的安全写法

> **务必**使用 `useSerializedSettingsSave` 包装原生 IPC 保存，
> 避免快速连续保存时较晚的旧快照覆盖较新的数据。

```ts
import { useSerializedSettingsSave } from '../../foundation/settings/useSerializedSettingsSave'

const { save } = useSerializedSettingsSave(async (snapshot) => {
  return window.api.saveSettings(snapshot) // 返回 boolean
})

await save({ /* 全部设置 */ }) // 自动排队
```

可选使用 `waitForLatest()` 等待最后一次保存完成（应用退出时使用）。

## 6. IPC 合约模式

### 6.1 preload 端（TypeScript-safe bridge）

```ts
// preload/index.ts
import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('demoApi', {
  loadSettings: () => ipcRenderer.invoke('demo:load-settings'),
  saveSettings: (s: unknown) => ipcRenderer.invoke('demo:save-settings', s),
  onEvent: (cb: (e: unknown) => void) => {
    const listener = (_: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on('demo:event', listener)
    return () => ipcRenderer.off('demo:event', listener)
  }
})

// preload/index.d.ts —— 渲染进程可见的类型
export interface DemoApi {
  loadSettings(): Promise<unknown>
  saveSettings(s: unknown): Promise<boolean>
  onEvent(cb: (e: unknown) => void): () => void
}
```

### 6.2 主进程端

```ts
// main/ipc/IpcDemo.ts
import { ipcMain } from 'electron'
export function registerDemoIpc(): void {
  ipcMain.handle('demo:load-settings', async () => /* ... */)
  ipcMain.handle('demo:save-settings', async (_e, snapshot) => /* ... */)
}
```

### 6.3 **重要**：IPC 参数防 Proxy

Vue 3 `ref()` / `reactive()` 会把对象包装为 Proxy，
Electron IPC 的 structured clone 无法序列化 Proxy。

**任何传入 `window.xxxApi.invoke()` 的对象参数都必须先序列化**：

```ts
await window.demoApi.saveSettings(JSON.parse(JSON.stringify(settings)))
```

这是 SuperConnectX 的硬性约束，参见项目根 README 与永久记忆。

## 7. 测试

### 7.1 单元测试（Vitest）

```bash
npm test                  # 单元测试
npm run test:coverage     # 覆盖率
npm run test:integration  # 集成测试
npm run test:e2e          # Playwright 端到端
```

测试位置约定：`tests/unit/<composable>.test.ts` 对应 `src/.../<composable>.ts`。

### 7.2 Foundation 单测应覆盖

- `useSplitWorkspace`：splitPanel / removePanel / onTabClosed / updateSplitRatio
- `useNotificationCenter`：去重、定时器清除、回调触发
- `useSidebarResize`：边界值、折叠阈值、释放监听
- `useTheme`：默认主题、持久化键、`data-theme` 写入
- `useSerializedSettingsSave`：顺序保证、失败隔离
- `SettingsRegistry`：去重、order 排序、label 延迟求值

### 7.3 集成测试（可选）

集成测试应在加载真实 Vue 组件、调用真实 IPC mock 的环境下跑。
可参考 `vitest.integration.config.ts`。

## 8. 构建与发布

```
npm run build          # 全平台（typecheck + electron-vite build + electron-builder）
npm run build:win      # Windows
npm run build:mac      # macOS
npm run build:linux    # Linux
npm run build:unpack   # 仅打包，不制作安装包
```

`electron-builder.yml` / `electron.vite.config.ts` 控制具体行为，
跨平台图标位于 `resources/`、`Image/`、`doc/icon/`。

## 9. 风格与硬约束速查

| 项 | 约束 |
|---|---|
| 目录边界 | `foundation/` 不得 import `features/`/`components/` |
| 组合子（composable） | 全部以 `useXxx` 命名，返回对象含全部方法与响应式状态 |
| 模板事件 | 推荐 **kebab-case**（Vue 3 同时兼容 camelCase/kebab） |
| IPC 参数 | 必须 `JSON.parse(JSON.stringify(obj))` 包裹 |
| 类型严格度 | `foundation` 模块无 `any`；业务模块可逐步收紧 |
| i18n | 文案必须经 `useI18n().t()` 走资源文件，硬编码仅限日志/调试 |
| 卸载钩子 | 全局监听（document/window）必须配套解绑函数 |

## 10. 已知注意事项

- README 标注 GPL-3.0 但仓库目前无独立 LICENSE 文件——再分发前需先确认版权与最终许可证策略；
- Electron 22+ 的 contextIsolation 默认为 true，所有 preload 必须通过 contextBridge 暴露 API；
- `useTheme` 直接写 `localStorage` 与 `document.documentElement`，未来若需要多窗口同步或后端持久化，需扩展该 composable。

## 11. 下一步

- 第二个复用项目出现时，把 `foundation/` 拆为独立 npm 包（`@superstudio/foundation`）；
- 给 workbench/shell 补 e2e 测试（Playwright 已有配置，见 `playwright.config.ts`）；
- 将 `useSerializedSettingsSave` 等小工具沉淀为 `@superstudio/util-*` 系列。

---

> 本指南由 SuperConnectX 拆分工作沉淀，欢迎把使用中遇到的实际问题回写到对应章节。