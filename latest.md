### 新增功能
1. **Monorepo 工程化架构升级** - 项目迁移至 pnpm workspace monorepo 架构：抽取 `shared/foundation` 公共基础包，主应用归位 `apps/superconnectx`（233 文件），模板项目改造为 workspace 包消费者（删除源码副本），CI 全面迁移 pnpm 并启用 frozen-lockfile 实现可复现构建

### 优化修复
1. **组件模块化完善** - 持续拆分串口显示详情、连接状态、菜单栏等模块，补全测试用例与文档说明，删除无效文件及过时的锁文件与构建缓存追踪
2. **CI 流水线修复** - 根治 cpu-features 构建问题、显式声明 builder-util-runtime 消除 pnpm 布局下的幽灵依赖 typecheck 失败、`pnpm add -w` 修复 workspace 根写入（Ubuntu24 job 降级 Electron 35），实现 CI 全绿
