# 公共代码组件化与 Monorepo 实施计划

> 状态：**阶段 1 实施中** —— Step 1.1 ✅ / 1.2 ✅ / 1.3 ✅（CI 门禁已验证通过）→ 下一步 Step 1.4
> 前置完成：《基础项目拆分实施计划》六步重构 ✅、`examples/base-desktop-app` 模板 ✅
> 关联文档：`docs/template-guide.md`（模板使用指南）
> 创建日期：2026-09-23 ｜ 实施记录见 §11

---

## 11. 实施记录（阶段 1）

### 2026-09-23：Step 1.1 ~ 1.3 完成，CI 验证通过

**已落地提交**（master 分支）：
- `2efe66f` 清理仓库：移除 tsbuildinfo 构建缓存追踪与过时的 npm 锁文件（决策 D2 落地：`package-lock.json` 已删）
- `949445d` 组件模块化：抽取 shared/foundation 包为 pnpm workspace（50 文件，git 正确识别 31 处 rename）
- 回滚锚点：tag `pre-monorepo`（改造前完整状态）

**验证结果**：
- 本地：typecheck 双侧全绿；单测 74 文件 / 1308 用例全过；dev 冒烟（Electron 4 进程 + 串口枚举正常）
- 远程：推送 master 后 **GitHub Actions CI 全平台构建成功**（4 平台矩阵 + ubuntu24 兼容包）

**与原计划的偏差记录**（实施时按实际情况调整）：
1. 根 `package.json` 未加 `workspaces` 数组 —— 直接切 pnpm 单一真相，不再兼容 npm 双协议
2. workspace 包解析采用 **alias 直连源码**（tsconfig paths + vite/vitest alias 三处同步），根 package.json 不声明 `workspace:*` 依赖 —— 因此现有 npm 流水线 CI 无需改动即通过；副作用是 CI 的 `hashFiles('package-lock.json')` 缓存 key 失效为常量（不失败，仅缓存退化）
3. `postinstall` 由 `electron-builder install-app-deps` 改为 `node scripts/rebuild-native.mjs`（@electron/rebuild 只构建 serialport，绕开永久损坏的 cpu-features）；CI 用 `--ignore-scripts` 不受影响
4. pnpm 构建脚本白名单（`onlyBuiltDependencies`）配置在 `pnpm-workspace.yaml`（pnpm 12 要求）；`.npmrc` 开启 `node-linker=hoisted` 规避 electron-builder symlink 兼容风险（R7 落地）
5. `.npmrc` 移除了 npmmirror 镜像行、新增 `electron_skip_binary_download`（本地复用已有二进制；CI 直接 `node install.js` 调用读不到该配置，二进制正常下载，互不干扰）
6. 包内测试未建独立 `vitest.config.ts`，改为根 `vitest.config.ts` 的 include 追加 `packages/*/tests/**/*.test.ts`（R8 简化方案）
7. `assets/themes.css` → 包内 `styles/themes.css` 的迁移**未执行**，顺延至 Step 1.6 评估（避免 Step 1.3 与样式回归耦合）
8. 已知坑（复现 3 次的统一处理方式）：新增 workspace 包后 `pnpm install` 失败时，删除 `node_modules/.modules.yaml` 状态缓存后重装即可

**遗留事项（Step 1.6 前需处理）**：
- CI 从 npm 迁移 pnpm（`pnpm/action-setup` + `--frozen-lockfile` + 缓存 key 改 `pnpm-lock.yaml`），**必须在下次发版 tag 之前完成**——当前 CI 无锁文件现场解析依赖版本，构建不可复现
- `examples/base-desktop-app/package-lock.json` 待 Step 1.5 改造时删除

---

## 1. 背景与目标

### 1.1 问题

`examples/base-desktop-app` 目前采用**复制目录**方式复用 foundation 层。这是模板孵化期的合理做法，但存在致命缺陷：**foundation 一旦改动，所有复用项目都要手动同步**。项目数量从 1 → 2 → N 后，同步成本线性增长且极易漂移。

### 1.2 目标（对标 C# 的 DLL 工程模式）

| C# 世界 | 目标状态（JS 世界） |
|---|---|
| 公共代码编译成 `.dll` | 公共代码打包为**私有 npm 包** |
| 新项目"添加引用"即用 | 新项目 `npm install @superx/xxx` 即用 |
| NuGet 服务器托管 | 私有 npm registry（Verdaccio / GitHub Packages）托管 |
| Assembly Version | semver + changesets 自动版本管理 |
| 改 DLL 要重发版 | 改包要发版（或 monorepo 内直接生效） |

**核心结论**：JS 生态里不需要"编译成单文件"这一步（纯源码分发即可），npm 包天然就是 DLL。但**不推荐直接跳到"独立仓 + 发包"**，而是走三阶段演进，先在 monorepo 内获得"改完即生效"的迭代效率，等出现真正的第二个外部消费者后再发布。

### 1.3 三阶段演进路线总览

```
阶段 1：Monorepo workspace 化（本期实施）
   foundation/shared 抽成 workspace 包，app 直接引用，改源码立即生效
        ↓ （出现第二个真实项目/团队时）
阶段 2：发布基建（按需）
   Turborepo 构建编排 + changesets 版本管理 + 包级独立单测
        ↓ （需要跨仓/跨团队分发时）
阶段 3：私有 registry 发布（按需）
   Verdaccio 私服或 GitHub Packages，workspace:* 切换为 ^1.0.0
   注意：拆仓不是发包的前提，monorepo 内的包可直接发布
```

---

## 2. 现状盘点

### 2.1 可复用边界分析

| 位置 | 内容 | 复用判定 |
|---|---|---|
| `src/renderer/src/foundation/theme/` | `useTheme.ts`（主题切换 + localStorage 持久化） | ✅ 纯 Vue，零业务 |
| `src/renderer/src/foundation/settings/` | `SettingsLayout.vue`、`SettingsRegistry.ts`、`useSerializedSettingsSave.ts`、`types.ts` | ✅ 纯 Vue + 纯逻辑 |
| `src/renderer/src/foundation/shell/` | `AppShell`、`WindowTitleBar`、`StatusBar`、`SidebarLayout`、`SidebarResizeHandle`、`NotificationCenter(.vue/.ts)`、`useSidebarResize.ts`（8 文件） | ✅ 纯 Vue，零业务 |
| `src/renderer/src/foundation/workbench/` | `SplitWorkspace.vue`、`WorkbenchTabBar.vue`、`useSplitWorkspace.ts`、`useWorkbenchTabs.ts`、`useWorkbenchTabDrag.ts`（5 文件） | ✅ 纯 Vue，零业务 |
| `src/renderer/src/foundation/i18n/` | 空目录 | ⬜ 占位，本期不处理 |
| `src/shared/workbench/` | 工作台类型 + 拖拽 MIME 常量 | ✅ 三进程共用合约 |
| `src/shared/ipc/` | IPC 通道常量 | ⚠️ SuperConnectX 专属通道（stopConnect/startConnect 等）留在 app；**模式**可复用但**内容**不可 |
| `src/shared/settings/`、`src/shared/extensions/` | 设置合约、扩展定义 | 🔍 待评估（阶段 1 期间逐文件判定） |
| `src/main/`（ipc 14 文件 / storage 10 文件 / pool / protocol / workers…） | 串口/SSH/Telnet/FTP 业务实现 | ❌ SuperConnectX 核心业务，**不抽包** |
| `src/renderer/src/features/`、`components/` | 终端、连接管理等业务域 | ❌ 业务层，留在 app |

### 2.2 关键约束（不可妥协）

1. **防 Proxy IPC 规则**必须随包文档化：任何经 `window.xxxApi` 传主进程的对象参数必须先 `JSON.parse(JSON.stringify(obj))` 包裹（Vue reactive Proxy 无法被 structured clone 序列化）
2. **Vue 必须是 peerDependency**：否则包和 app 各自打包一份 Vue，`ref`/`reactive` 跨实例失效（SFC 库最常见事故）
3. **三进程边界**：渲染层包（foundation）绝不能被主进程/preload 引用；三端共用类型只能放 shared 包
4. **现有 CI/打包流程不破坏**：`npm run build:win/mac/linux`、electron-builder 打包产物路径不变

---

## 3. 目标架构（阶段 1 完成后）

```
SuperConnectX/                          # monorepo 根
├── pnpm-workspace.yaml                 # packages/* + apps/*
├── package.json                        # 根：工作区脚本 + 公共 devDeps（turbo 阶段2再加）
├── packages/
│   ├── foundation/                     # @superx/foundation —— 渲染层框架原语
│   │   ├── package.json                # peerDeps: vue；exports: ./shell/* ./workbench/* ./theme/* ./settings/*
│   │   ├── src/
│   │   │   ├── shell/                   (8 文件，自 src/renderer/src/foundation/shell 迁入)
│   │   │   ├── workbench/              (5 文件 + types.ts 自 src/shared/workbench 迁入)
│   │   │   ├── settings/               (4 文件)
│   │   │   ├── theme/                  (useTheme.ts)
│   │   │   └── styles/themes.css       (dark/light CSS 变量，自 assets 迁入)
│   │   └── vitest.config.ts            # 包级单测（现有 foundation 测试迁入）
│   ├── shared/                         # @superx/shared —— 三进程共用合约
│   │   ├── package.json                # 零运行时依赖，纯类型/常量
│   │   └── src/
│   │       └── workbench/types.ts      (拖拽 MIME 常量等)
│   └── template-app/                   # @superx/template-app —— 模板示例项目（nominal 包，不发布）
│       ├── package.json                # deps: @superx/foundation workspace:*, @superx/shared workspace:*
│       └── src/                        (自 examples/base-desktop-app 迁入，删除复制的 foundation)
├── apps/
│   └── superconnectx/                  # @superx/superconnectx —— 主应用（现有 src/ 整体迁入）
│       ├── package.json                # deps: @superx/foundation workspace:*, @superx/shared workspace:* + 全部业务依赖
│       ├── electron.vite.config.ts     # alias 调整：@foundation → 包源码
│       └── src/                        (features/components/composables 保持原位，仅 foundation 引用改包名)
├── doc/ 、docs/ 、tests/ 、scripts/ …  # 现有目录原位保留（阶段 1 tests 是否上提见 §6.3）
└── examples/                           # 删除（内容迁入 packages/template-app）
```

### 3.1 依赖关系图

```
@superx/template-app ──┐
                      ├──> @superx/foundation ──> vue (peer)
@superx/superconnectx ┤         │
                      │         └──> @superx/shared (仅 workbench types)
                      └──> @superx/shared
```

- `@superx/shared`：零依赖，被三进程（main/preload/renderer）引用
- `@superx/foundation`：只依赖 vue（peer）+ @superx/shared（workspace），仅被 renderer 引用
- 两个 app 互不感知，只依赖上面两个包

### 3.2 包的 exports 设计（@superx/foundation）

```jsonc
{
  "name": "@superx/foundation",
  "version": "0.1.0",
  "type": "module",
  "peerDependencies": { "vue": "^3.4.0" },
  "dependencies": { "@superx/shared": "workspace:*" },
  "exports": {
    ".": "./src/index.ts",
    "./shell": "./src/shell/index.ts",
    "./shell/AppShell": "./src/shell/AppShell.vue",
    "./workbench": "./src/workbench/index.ts",
    "./workbench/*": "./src/workbench/*",
    "./settings": "./src/settings/index.ts",
    "./theme": "./src/theme/index.ts",
    "./styles/themes.css": "./src/styles/themes.css"
  }
}
```

**发布策略：直接分发 TypeScript 源码**（含 `.vue` 单文件），由消费者 bundler 编译。理由：
- 内部使用无需预编译，省掉 vite lib mode + vite-plugin-dts 的全套维护
- electron-vite / vite 天然支持从 `node_modules` 里的 workspace 软链解析 `.vue`
- 阶段 3 若需对外发布，再追加 build 产物（不阻塞本期）

---

## 4. 阶段 1 详细任务清单：Monorepo workspace 化

> 预计工作量：1.5 ~ 2 天（含全量回归）
> 原则：**先建包、再迁移、后清理**；每步可独立验证、可回滚

### Step 1.1 工作区初始化（0.5h）✅ 已完成（2026-09-23）

- [x] 根目录新增 `pnpm-workspace.yaml`：`packages/*` + `apps/*` + pnpm 12 构建脚本白名单（`onlyBuiltDependencies`：electron/esbuild/ssh2/@electron/rebuild/@serialport/bindings-cpp；显式排除 cpu-features）
- [x] 根 `packageManager` 字段（pnpm@12.5.1）；**未加** `workspaces` 数组（见 §11 偏差 1）
- [x] `postinstall` 改为 `node scripts/rebuild-native.mjs`（@electron/rebuild 只构建 serialport）；新增 devDep `@electron/rebuild`
- [x] `.npmrc`：`node-linker=hoisted`；生成 `pnpm-lock.yaml`
- ✅ 验证通过：`pnpm install` 成功；dev 冒烟启动正常

### Step 1.2 抽取 @superx/shared（1h）✅ 已完成（2026-09-23）

- [x] 新建 `packages/shared/package.json`（name: `@superx/shared`，无 deps）
- [x] 迁移 `src/shared/workbench/types.ts` → `packages/shared/src/workbench/types.ts`
- [x] `src/shared/` 其余内容（ipc/settings/extensions）**暂留原位**——与业务耦合，Step 1.6 逐文件评估
- [x] 主应用引用改写 6 处（WorkbenchTabBar.vue、useWorkbenchTabDrag.ts、useSplitWorkspace.ts、SplitWorkspace.vue、TabBar.vue、useWorkbenchTabDrag.test.ts）
- ✅ 验证通过：typecheck 全绿；1308 单测全过

### Step 1.3 抽取 @superx/foundation（4h，核心步骤）✅ 已完成（2026-09-23）

- [x] 新建 `packages/foundation/`，按 §3.2 写 `package.json`（vue 为 peerDependencies，依赖 @superx/shared）
- [x] 四模块整体 `git mv`（theme/settings/shell/workbench 共 16 文件 + README），内容零改动
- [x] ~~`assets/themes.css` 迁移~~ → **顺延至 Step 1.6 评估**（见 §11 偏差 7）
- [x] 迁移 8 个单测 → `packages/foundation/tests/`；未建包级 vitest.config，改为根配置 include 追加（见 §11 偏差 6）
- [x] 主应用 `src/renderer/src/foundation/` 目录删除，11 个文件 import 重写为 `@superx/foundation/xxx`
- ✅ 验证通过：typecheck 双侧全绿；1308 单测全过；dev 冒烟（主题/标签栏/串口）正常

### Step 1.4 主应用归位为 workspace app（2h）

- [ ] 根 `src/` → `apps/superconnectx/src/`（`git mv` 保留历史）
- [ ] 迁移 `electron.vite.config.ts`、`tsconfig.*.json`、`electron-builder.yml`、`index.html` 等 app 级配置
- [ ] 根 `package.json` 业务依赖（vue 除外，vue 保留在根或提升 peer）→ `apps/superconnectx/package.json`；app 的 `dependencies` 增加两个 workspace 包
- [ ] 根 scripts 迁移到 app（dev/build/typecheck/test），根 scripts 改为 `pnpm -r` 编排形式（阶段 2 换 turbo）
- [ ] `electron-vite.config.ts` 调整：`externalizeDepsPlugin` 保持；workspace 包无需额外 externalize（pnpm 软链指向源码，vite 直接编译）
- **验证**：`pnpm --filter @superx/superconnectx build:win` 完整打包成功，产物 `apps/superconnectx/dist/` 可安装运行

### Step 1.5 模板项目改造为包消费者（2h）

- [ ] `examples/base-desktop-app` → `packages/template-app/`（`git mv`）
- [ ] **删除其复制的 `src/renderer/src/foundation/` 全部源码与 `src/shared/workbench/`**——这是本阶段的验收核心：模板从"复制"变为"引用"
- [ ] `package.json` 改为：`"dependencies": { "@superx/foundation": "workspace:*", "@superx/shared": "workspace:*", "vue": "^3.5.21", ... }`
- [ ] import 路径全部改包名；`electron.vite.config.ts` 增加 workspace 包解析
- **验证**：`pnpm --filter @superx/template-app dev` 启动；Counter/Settings/About/主题切换全功能正常；**修改 `packages/foundation/src/theme/useTheme.ts`（如默认主题改 light），template-app 无需任何操作，重启 dev 即生效**——这是"单源迭代"的直接证明

### Step 1.6 清理与收尾（1h）

- [ ] `src/shared/` 剩余文件去向判定：
  - `ipc/`（SuperConnectX 通道）→ 留在 app：`apps/superconnectx/src/shared/ipc/`
  - `settings/`、`extensions/` → 按耦合度决定留 app 或补迁 shared 包（**允许全部留 app，不强行抽**）
- [ ] **CI 迁移 pnpm**（§11 遗留事项，优先级最高）：两 workflow 加 `pnpm/action-setup`、`npm install` → `pnpm install --frozen-lockfile`、缓存 key 改 `hashFiles('pnpm-lock.yaml')`、`install-app-deps` → `rebuild-native.mjs`；**必须在下次发版 tag 前完成**
- [ ] `assets/themes.css` 是否迁移 `@superx/foundation/styles/themes.css`（§11 偏差 7 顺延项，评估与 Step 1.3 样式回归的耦合）
- [ ] 更新 `docs/template-guide.md`：复用方式从"拷贝目录"改为"workspace 引用"，保留拷贝说明作为离线场景备注
- [ ] 更新本文件状态标记 + 《基础项目拆分实施计划.md》交叉引用
- [x] `.gitignore` 已加 `*.tsbuildinfo`；`package-lock.json` 已删（D2 已决策落地，commit `2efe66f`）
- **验证**：全仓 `pnpm -r typecheck && pnpm -r test`；两个 app 各自 `dev` 启动冒烟

### 1.7 阶段 1 完成标准（DoD）

- [ ] 修改 foundation 任一文件，两个 app 重启 dev 后均反映变更（单源）
- [ ] 主应用功能零回归（六步重构验证清单 + 手动回归：主题/标签/分屏/侧栏/设置/串口连接）
- [ ] 1308 既有用例 + 迁入包内用例全绿；`pnpm -r build`（不含打包安装包）成功
- [ ] `examples/` 目录删除，模板升级为 `packages/template-app`
- [ ] CI（若有）脚本适配 workspace 命令

---

## 5. 阶段 2：发布基建（占位，触发条件：第二个真实项目接入）

- [ ] 引入 **Turborepo**：根 `turbo.json` 定义 `build`/`typecheck`/`test` 任务管道 + 远程缓存
- [ ] 引入 **changesets**：`.changeset/` 目录 + `version`/`publish` 脚本；包版本独立演进 + 自动 changelog
- [ ] 包级发布产物构建（若需对外）：foundation 追加 `tsup`/vite lib mode + `vite-plugin-dts`（`.vue` 预编译 + 类型声明），`exports` 补 `dist/` 分支
- [ ] CI 分包流水线：PR 触发受影响包的测试（turbo filter）
- [ ] 破坏性变更治理：foundation 对 app 的兼容性由 `workspace:*` 期间靠 typecheck 兜底，发包前引入 API 快照测试

## 6. 阶段 3：私有 registry 发布（占位，触发条件：跨仓/跨团队分发需求）

- [ ] registry 选型落地：**Verdaccio**（自托管，零成本，支持代理 npm 上游）或 **GitHub Packages**（依托现有 GitHub 仓库权限）
- [ ] 根 `.npmrc`：`@superx:registry=<私有地址>`；发布走 CI 凭据
- [ ] app 依赖从 `workspace:*` 切 `^0.x.0`（保留 monorepo，两者可共存：monorepo 内 workspace 协议优先）
- [ ] 是否**物理拆仓**（foundation 独立 repo）：默认不拆——monorepo 中的包可直接发布；仅当迭代节奏/权限边界冲突时再拆，拆仓时把 `packages/foundation` 连同 changesets 历史整体迁出

---

## 7. 关键技术决策与风险

### 7.1 技术坑位清单

| # | 坑 | 对策 |
|---|---|---|
| R1 | Vue 双实例（包内 bundle 一份 vue） | `peerDependencies` + electron-vite 的 `externalizeDepsPlugin` 自动处理 peer |
| R2 | workspace 包内 `.vue` 无法被 vite 解析 | `exports` 直接指向 `.vue` 源文件；vite 对 symlink 默认 `preserveSymlinks: false`，无需额外配置；dev 期间 HMR 跨包生效 |
| R3 | 主进程误引渲染层包（foundation 依赖 DOM） | foundation 的 `package.json` 不声明 main 进程入口；ESLint 加 `no-restricted-imports` 规则：`src/main`、`src/preload` 禁止 import `@superx/foundation` |
| R4 | CSS 变量文件双份漂移 | 变量**只**在 `foundation/src/styles/themes.css`，app 的 `main.css` 仅 `@import`；新增变量必须进包而非 app |
| R5 | 防 Proxy 规则在包边界失传 | 该规则写入 `foundation` 的包 README（随包分发），且 shared 包的 IPC 模式文档化；新模板项目沿用 `examples/base-desktop-app` 的注释规范 |
| R6 | `git mv` 大规模移动导致 CI/IDE 缓存失效 | 每步独立提交；移动与内容修改分离（先 `git mv` 提交，再改 import 提交），保证 diff 可审 |
| R7 | pnpm 与 electron-builder 的 `postinstall`（install-app-deps）兼容 | pnpm 下 electron-builder 支持 `node-linker=hoisted`（必要时 `.npmrc` 开启）；阶段 1 验证打包为准 |
| R8 | 测试目录迁移后 vitest workspace 配置重复 | 根 `vitest.workspace.ts` 统一编排（vitest 原生支持 projects） |

### 7.2 待决策问题（实施前需确认）

| # | 问题 | 选项 | 倾向 |
|---|---|---|---|
| D1 | 包管理器 | pnpm / npm workspaces / yarn(berry) | **已决策：pnpm**（12.5.1 已落地，`packageManager` 字段锁定） |
| D2 | 是否保留 `package-lock.json` 双锁文件 | 迁移后删 / 并存 | **已决策：删**（commit `2efe66f`，CI 已在无锁状态下验证通过；发版前需完成 CI pnpm 迁移） |
| D3 | 根目录 `tests/`（86 文件）是否随包上提 | 全留根 / 按归属拆到包内 | foundation/shared 相关**上提**（8 个单测已迁 `packages/foundation/tests/`），业务测试随 app |
| D4 | 主应用目录是否物理移动到 `apps/` | 移动 / 原位保留只改 package 归属 | **移动**（一次性成本换取结构清晰），`git mv` 保历史；回滚锚点 tag `pre-monorepo` |
| D5 | template-app 放 `packages/` 还是 `apps/` | 二者皆可 | `packages/`（它不发布但被作为孵化模板引用） |

### 7.3 回滚策略

- 阶段 1 每步独立 commit，任一步失败 `git revert` 单步即可
- Step 1.4（主应用移动）为最大风险点：移动前打 tag `pre-monorepo`，失败时 `git reset --hard pre-monorepo` 整体回退
- 全程不删除 `examples/base-desktop-app` 的 git 历史（`git mv` 保留），最坏情况可从历史恢复复制式模板

---

## 8. 与现状的兼容性影响评估

| 项 | 影响 | 处理 |
|---|---|---|
| `npm run dev / build:win` 等脚本 | 入口从根改为 app 或根做编排 | 根保留同名 scripts 转发，开发者无感 |
| electron-builder 产物 | 输出路径随 app 目录变化 | `electron-builder.yml` 相对路径调整，CI 产物收集路径同步 |
| Playwright e2e | 工作目录变化 | `playwright.config.ts` 的 webServer/testDir 调整 |
| 现有 86 个单测文件 | 约 6~8 个 foundation 相关文件迁入包内 | 其余原位不动 |
| `doc/`、`docs/`、`scripts/`、`skills/` | 无 | 原位保留 |

---

## 9. 时间估算汇总

| 阶段 | 工作量 | 备注 |
|---|---|---|
| Step 1.1 工作区初始化 | 0.5h | |
| Step 1.2 抽 shared 包 | 1h | |
| Step 1.3 抽 foundation 包 | 4h | 核心步骤，含单测迁移 |
| Step 1.4 主应用归位 apps/ | 2h | 最大风险点，先打 tag |
| Step 1.5 模板改造为消费者 | 2h | 验收核心 |
| Step 1.6 清理收尾 | 1h | |
| 回归 + 文档 | 1.5h | |
| **合计** | **≈ 2 人日** | |

---

## 10. 下一步

1. 确认 §7.2 五个待决策问题（默认按"倾向"列执行）
2. 按步骤实施，每步完成后在本文件勾选并更新状态
3. 阶段 2/3 保持占位，触发条件出现时再细化
