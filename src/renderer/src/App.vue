<template>
  <div class="app-container">
    <CustomTitleBar
      @toggle-connection-list="toggleConnectionList"
      :show-connection-list="showConnectionList"
    />
    <!-- 主内容区：左侧连接列表 + 右侧终端 -->
    <main class="app-main">
      <div class="connection-list-wrapper" :class="{ collapsed: !showConnectionList }">
        <div class="connection-list">
          <el-button type="primary" class="vscode-btn" icon="Plus" @click="openCreateDialog"
            >新建连接</el-button
          >

          <SearchInput @search="handleSearch" />

          <div class="empty-state" v-if="filterConnection.length === 0">
            暂无连接，点击「新建连接」添加
          </div>
          <el-card
            shadow="never"
            class="connection-card"
            v-for="conn in filterConnection"
            :key="conn.id"
          >
            <div class="connection-info">
              <div class="conn-name">{{ conn.name }}</div>
              <div class="conn-detail">
                <span>协议：{{ conn.type.toUpperCase() }}</span>
                <span>地址：{{ conn.host }}:{{ conn.port }}</span>
                <span v-if="conn.username">用户：{{ conn.username }}</span>
              </div>
            </div>
            <div class="connection-actions">
              <div class="connection-btn">
                <el-button
                  type="text"
                  class="el-button--primary"
                  icon="Link"
                  @click="connectToServer(conn)"
                  >连接</el-button
                >
              </div>
              <div class="connection-btn">
                <el-button
                  class="el-button--primary"
                  type="text"
                  style="color: #cccccc"
                  icon="edit"
                  @click="editCreateDialog(conn)"
                  >编辑</el-button
                >
              </div>
              <div class="connection-btn">
                <el-button
                  type="text"
                  class="el-button--primary"
                  icon="Delete"
                  @click="deleteConnection(conn)"
                  style="color: #b23f3f"
                  >删除</el-button
                >
              </div>
            </div>
          </el-card>
        </div>
      </div>
      <div class="terminal-panel" :class="{ expanded: !showConnectionList }">
        <TelnetTerminal
          v-if="activeConnection"
          :connection="activeConnection"
          @onClose="handleTerminalClose"
        />
        <div class="terminal-placeholder" v-else>选择一个连接或新建连接以启动终端</div>
      </div>
    </main>

    <div class="status-bar">
      <div class="resource-monitor">
        <ResourceMonitor />
      </div>
    </div>

    <!-- 新建连接弹窗：Element Plus 美化表单 -->
    <el-dialog
      title="新建连接"
      v-model="isCreateDialogOpen"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="newConnForm" :rules="newConnRules" ref="connFormRef" label-width="120px">
        <el-form-item label="协议类型" prop="type">
          <el-select v-model="newConnForm.type" placeholder="选择协议">
            <el-option label="Telnet" value="telnet" />
            <el-option label="SSH" value="ssh" disabled />
            <!-- 预留 SSH 选项 -->
          </el-select>
        </el-form-item>
        <el-form-item label="连接名称" prop="name">
          <el-input v-model="newConnForm.name" placeholder="输入连接名称" prefix="User" />
        </el-form-item>
        <el-form-item label="服务器地址" prop="host">
          <el-input v-model="newConnForm.host" placeholder="输入 IP 地址或域名" prefix="Monitor" />
        </el-form-item>
        <el-form-item label="端口" prop="port">
          <el-input
            v-model.number="newConnForm.port"
            placeholder="输入端口"
            prefix="Key"
            type="number"
          />
        </el-form-item>
        <el-form-item label="用户名" prop="username">
          <el-input
            v-model="newConnForm.username"
            placeholder="输入登录用户名（可选）"
            prefix="UserFilled"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="danger" style="width: 100px" @click="isCreateDialogOpen = false"
          >取消</el-button
        >
        <el-button type="primary" style="width: 100px" class="vscode-btn" @click="submitNewConn"
          >确认保存</el-button
        >
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 1. Vue 内置 API：从 vue 导入
import { ref, onMounted, watch } from 'vue'
// 2. Element Plus 组件/工具：从 element-plus 导入
import { ElMessage, ElForm, ElMessageBox } from 'element-plus'
import TelnetTerminal from './components/TelnetTerminal.vue'
import CustomTitleBar from './components/CustomTitleBar.vue'
import SearchInput from './components/SearchInput.vue'
import ResourceMonitor from './components/ResourceMonitor.vue'

const searchKeyword = ref('') // 搜索关键词
const filterConnection = ref<any[]>([])
// 连接列表（从 electron-store 加载）
const connections = ref<any[]>([])
// 新建连接弹窗状态
const isCreateDialogOpen = ref(false)
// 表单引用（用于验证）
const connFormRef = ref<InstanceType<typeof ElForm> | null>(null)
// 新建连接表单数据
const newConnForm = ref({
  name: '',
  type: 'telnet', // 默认 Telnet 协议
  host: '',
  port: 23, // 默认 Telnet 端口
  username: ''
})
// 表单验证规则
const newConnRules = ref({
  name: [{ required: true, message: '请输入连接名称', trigger: 'blur' }],
  host: [
    { required: true, message: '请输入服务器地址', trigger: 'blur' },
    {
      pattern: /^([0-9]{1,3}\.){3}[0-9]{1,3}$|^[a-zA-Z0-9.-]+$/,
      message: '请输入有效的 IP 地址或域名',
      trigger: 'blur'
    }
  ],
  port: [
    { required: true, message: '请输入端口', trigger: 'blur' },
    { type: 'number', min: 1, max: 65535, message: '端口范围 1-65535', trigger: 'blur' }
  ]
})

// 初始化：加载本地保存的连接
onMounted(() => {
  console.log('window.electronStore:', window.electronStore) // 打印日志
  loadConnections()
})

// 过滤后的列表
const filtereList = () => {
  if (!searchKeyword.value) {
    filterConnection.value = connections.value
    return
  }
  const keyword = searchKeyword.value.toLowerCase()
  filterConnection.value = connections.value.filter(
    (item) =>
      item.name.toLowerCase().includes(keyword) ||
      item.type.toLowerCase().includes(keyword) ||
      item.host.toLowerCase().includes(keyword) ||
      String(item.port).includes(keyword)
  )
}

// 处理搜索（接收搜索组件事件）
const handleSearch = (keyword: string) => {
  searchKeyword.value = keyword
}

watch([() => connections.value, () => searchKeyword.value], () => filtereList(), {
  immediate: true,
  deep: true
})

// 加载连接列表（从 electron-store 获取）
const loadConnections = async () => {
  try {
    // 强制确保返回值是数组（如果为 undefined 或非数组，默认空数组）
    const savedConn = await window.electronStore.getConnections()
    console.log('savedConn')
    console.log(savedConn)
    connections.value = Array.isArray(savedConn) ? savedConn : []
  } catch (e) {
    ElMessage.error('加载连接失败，请重启应用')
    console.error('加载连接失败：', e)
    // 出错时也强制设为空数组，避免后续操作报错
    connections.value = []
  }
}

// 打开新建连接弹窗
const openCreateDialog = () => {
  // 重置表单
  newConnForm.value = {
    name: '',
    type: 'telnet',
    host: '',
    port: 23,
    username: ''
  }
  if (connFormRef.value) {
    connFormRef.value.clearValidate() // 清除之前的验证提示
  }
  isCreateDialogOpen.value = true
}

const editCreateDialog = (conn) => {
  console.log(`conn`)
  console.log(conn)
  newConnForm.value = {
    id: conn.id,
    name: conn.name,
    type: conn.type,
    host: conn.host,
    port: conn.port,
    username: conn.username
  }
  isCreateDialogOpen.value = true
}

// 提交新建连接表单
const submitNewConn = async () => {
  if (!connFormRef.value) return

  try {
    await connFormRef.value.validate()
    if (newConnForm.value.id) {
      // 1. 提交新连接
      await window.electronStore.updateConnection({
        // 显式转换为纯数据对象，避免响应式属性
        id: newConnForm.value.id,
        name: newConnForm.value.name,
        type: newConnForm.value.type,
        host: newConnForm.value.host,
        port: newConnForm.value.port,
        username: newConnForm.value.username
      })
    } else {
      // 1. 提交新连接
      await window.electronStore.addConnection({
        // 显式转换为纯数据对象，避免响应式属性
        name: newConnForm.value.name,
        type: newConnForm.value.type,
        host: newConnForm.value.host,
        port: newConnForm.value.port,
        username: newConnForm.value.username
      })
    }

    // 2. 重新加载整个连接列表（而非手动 push），确保数据同步
    loadConnections()
    // 3. 关闭弹窗并提示
    isCreateDialogOpen.value = false
    ElMessage.success(`连接 "${newConnForm.value.name}" 已保存`)
  } catch (error) {
    console.error(error)
    ElMessage.error('请完善表单信息并修正错误')
  }
}

// 删除连接
const deleteConnection = async (conn) => {
  try {
    // 显示确认对话框
    await ElMessageBox.confirm(`确认删除 ${conn.name}?`, '删除连接', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
      center: true
    })

    // 用户确认后执行删除操作
    const newConnections = await window.electronStore.deleteConnection(conn.id)
    connections.value = newConnections
    ElMessage.success('连接已删除')
  } catch (error) {
    // 用户取消删除时不做任何操作，或显示提示
    if (error !== 'cancel') {
      console.error('删除失败:', error)
      ElMessage.error('删除连接失败')
    }
  }
}

// 打开设置（预留）
const openSettings = () => {
  ElMessage.info('设置面板开发中...')
}

// 添加活跃连接状态

const activeConnection = ref<any>(null)

// 修改连接函数
const connectToServer = (conn: any) => {
  activeConnection.value = conn
}

const handleTerminalClose = () => {
  console.log('关闭 Telnet 终端')
  activeConnection.value = null // 清空激活的连接，让终端组件销毁
}

// 新增：控制连接列表显示状态的变量
const showConnectionList = ref(true)

// 新增：切换连接列表显示状态的方法
const toggleConnectionList = () => {
  showConnectionList.value = !showConnectionList.value
}

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'F12' || e.keyCode === 123) {
    e.preventDefault()
    window.electronStore.openDevtools()
  }
})
</script>

<style scoped>
/* 工具栏样式替代原来的header */
.app-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 50px;
  border-bottom: 1px solid #333;
  background: #2d2d2d;
}

.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #fff;
  overflow: hidden;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 60px;
  border-bottom: 1px solid #333;
  background: #2d2d2d;
}

.header-actions button {
  margin-left: 10px;
}

.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.connection-list {
  width: 320px;
  border-right: 1px solid #333;
  padding: 20px;
  overflow-y: auto;
  background: #252526;
}

.connection-list h3 {
  margin: 0 0 20px 0;
  color: #e0e0e0;
}

.empty-state {
  color: #888;
  margin-top: 20px;
  text-align: center;
  padding: 40px 0;
  background: #2d2d2d;
  border-radius: 8px;
}

/* 连接卡片样式 */
.connection-card {
  background: #2d2d2d !important;
  border: 1px solid #3a3a3a !important;
  margin-top: 12px;
  border-radius: 8px !important;
  overflow: hidden;
}

/* 鼠标悬浮样式：显示阴影 + 改变边框颜色/宽度 */
.connection-card:hover {
  /* 边框：颜色改为主题色 + 宽度稍增（可选） */
  border: 1px solid rgb(64, 158, 255) !important;
  transform: translateY(-2px);
}

.conn-name {
  font-size: 16px;
  font-weight: 1000;
  color: #e0e0e0;
  margin-bottom: 8px;
}

.conn-detail {
  font-size: 13px;
  color: #aaa;
  line-height: 1.6;
}

.conn-detail span {
  display: block;
  margin-bottom: 4px;
}

.connection-actions {
  display: flex;
  justify-content: left;
  padding: 8px 12px;
  border-top: 1px solid #3a3a3a;
}

.connection-actions button {
  margin-left: 8px;
}

/* Element Plus 弹窗表单样式适配 */
.el-dialog {
  background: #2d2d2d !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #fff !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #ccc !important;
}

.el-input,
.el-select {
  --el-input-bg-color: #cccccc !important;
  --el-input-text-color: #000 !important;
  --el-input-placeholder-color: #888 !important;
  --el-border-color: #444 !important;
}

.el-input:focus-within,
.el-select:focus-within {
  --el-border-color: #42b983 !important;
}

.vscode-btn {
  width: 100%;
  background-color: #0e639c;
  border: none;
}

.vscode-btn:hover {
  background-color: #1177bb;
}

.status-bar {
  height: 25px;
  background-color: #007acc;
  display: flex;
  flex-direction: column; /* 垂直排列 */
}
/* 连接列表容器：核心过渡逻辑 */
.connection-list-wrapper {
  width: 320px; /* 展开时的宽度 */
  min-width: 320px; /* 防止收缩时内容挤压 */
  height: 100%;
  transition: all 0.3s ease-in-out; /* 平滑过渡：时长0.3秒，缓动曲线 */
  overflow: hidden;
  flex-shrink: 0; /* 防止flex布局挤压宽度 */
  box-sizing: border-box; /* 关键：宽度包含边框，避免溢出 */
}

/* 收起状态：宽度收窄为0 */
.connection-list-wrapper.collapsed {
  width: 0;
  min-width: 0;
  border-right: none; /* 收起时隐藏边框 */
}

/* 终端面板：过渡宽度和边距 */
.terminal-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1e1e;
  color: #aaa;
  font-size: 14px;
  flex: 1; /* 默认占剩余宽度 */
  padding: 0px;
  transition: padding-left 0.3s ease-in-out; /* 边距过渡 */
  height: 100%;
  overflow: auto;
}

/* 原有连接列表样式（补充） */
.connection-list {
  height: 100%;
  padding: 8px;
  overflow: auto;
  box-sizing: border-box; /* 关键：padding 计入高度，不超出容器 */
  overflow-y: auto; /* 仅纵向滚动，横向隐藏 */
  overflow-x: hidden;
  /* 优化滚动体验（可选） */
}

/* 1. connection-list 滚动条整体 */
.connection-list::-webkit-scrollbar {
  width: 10px !important; /* 列表内滚动条更窄，区别于全局 */
  height: 6px !important;
  background: transparent !important; /* 轨道透明 */
}

/* 2. connection-list 滚动条轨道 */
.connection-list::-webkit-scrollbar-track {
  background: transparent !important; /* 完全透明，更简洁 */
  border-radius: 3px !important; /* 圆角适配窄滚动条 */
}

/* 3. connection-list 滚动条滑块 */
.connection-list::-webkit-scrollbar-thumb {
  background: #464647 !important; /* 自定义滑块颜色（浅灰蓝） */
  border-radius: 0px !important; /* 与宽度匹配的圆角 */
  border: 0 !important; /* 移除默认边框 */
  transition: background 1s ease !important; /* hover 过渡 */
}

/* 4. 滑块 hover 状态 */
.connection-list::-webkit-scrollbar-thumb:hover {
  background: #515151 !important; /* hover 加深颜色 */
  transform: scale(1.05) !important; /* 轻微放大，增强交互 */
}

/* 5. 滑块 active 状态（拖动时） */
.connection-list::-webkit-scrollbar-thumb:active {
  background: #626263 !important; /* 拖动时更深 */
}

/* 关键词高亮样式 */
.highlight {
  background: #fde68a;
  color: #92400e;
  padding: 0 2px;
  border-radius: 2px;
}

/* 提示文本 */
.no-result,
.empty-list {
  font-size: 12px;
  color: #9ca3af;
  text-align: center;
  margin-top: 20px;
}

.connection-btn:deep(.el-button--primary) {
  background-color: transparent;
  padding: 5px;
}

.connection-btn:deep(.el-button--primary:hover) {
  background-color: #454646;
}

.resource-monitor {
  height: 100%;
  margin-left: 10px;
  background-color: transparent;
  color: white;
  font-size: 11px;
  padding: 0px 10px;
  display: flex;

  align-items: center;
  width: fit-content;
  align-items: center; /* 垂直居中对齐 */
  user-select: none;
}

.resource-monitor:hover {
  background-color: #45464655;
}
</style>
