# Renderer Foundation

渲染进程中可复用的桌面应用能力。所有模块必须通过 props、emits、插槽或明确的服务接口与业务交互，**不得**直接调用 `window.connectApi` 或导入连接、终端、串口业务组件。

## 模块职责

- `theme`：主题状态、应用与持久化（`useTheme`），标题栏换肤组件 `ThemeSwitcher`（标签经 props 注入，支持外部控制器共享），以及规范主题令牌 `themes.css`（`import '@superx/foundation/theme/themes.css'` 一次导入即得深/浅全套配色；品牌应用可在此之后覆盖个别变量，无需整套重写）。
- `i18n`：国际化初始化与语言偏好。
- `settings`：设置注册表、基础设置中心及表单模型。
- `workbench`：通用 Tab、分屏、会话布局和状态管理。
- `shell`：标题栏、侧栏布局、主工作区、状态栏、通知容器，以及状态栏 CPU/内存占用率监视组件 `ResourceMonitor`（数据源经 `fetcher` prop 注入，零 IPC 耦合）。

业务模块位于 `src/renderer/src/features`（后续迁移），通过配置和插槽接入这些基础能力。
