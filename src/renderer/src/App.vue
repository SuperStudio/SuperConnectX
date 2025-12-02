<template>
  <div class="app-container">
    <CustomTitleBar />
    <!-- 顶部导航栏 -->
    <div class="app-toolbar">
      <h1>🚀 SuperConnectX</h1>
      <div class="header-actions">
        <!-- 新建连接按钮：触发弹窗 -->
        <el-button type="primary" icon="Plus" @click="openCreateDialog">新建连接</el-button>
        <el-button type="default" icon="Setting" @click="openSettings">设置</el-button>
      </div>
    </div>

    <!-- 主内容区：左侧连接列表 + 右侧终端 -->
    <main class="app-main">
      <div class="connection-list">
        <h3>已保存连接</h3>
        <div class="empty-state" v-if="connections.length === 0">
          暂无连接，点击「新建连接」添加
        </div>
        <el-card shadow="hover" class="connection-card" v-for="conn in connections" :key="conn.id">
          <div class="connection-info">
            <div class="conn-name">{{ conn.name }}</div>
            <div class="conn-detail">
              <span>协议：{{ conn.type.toUpperCase() }}</span>
              <span>地址：{{ conn.host }}:{{ conn.port }}</span>
              <span v-if="conn.username">用户：{{ conn.username }}</span>
            </div>
          </div>
          <div class="connection-actions">
            <el-button type="text" icon="Link" @click="connectToServer(conn)">连接</el-button>
            <el-button
              type="text"
              icon="Delete"
              @click="deleteConnection(conn.id)"
              text-color="#ff4d4f"
              >删除</el-button
            >
          </div>
        </el-card>
      </div>
      <div class="terminal-panel">
        <TelnetTerminal
          v-if="activeConnection"
          :connection="activeConnection"
          @onClose="handleTerminalClose"
        />
        <div class="terminal-placeholder" v-else>选择一个连接或新建连接以启动 SSH/Telnet 终端</div>
      </div>
    </main>

    <!-- 新建连接弹窗：Element Plus 美化表单 -->
    <el-dialog
      title="新建 Telnet 连接"
      v-model="isCreateDialogOpen"
      width="500px"
      :close-on-click-modal="false"
    >
      <el-form :model="newConnForm" :rules="newConnRules" ref="connFormRef" label-width="80px">
        <el-form-item label="连接名称" prop="name">
          <el-input
            v-model="newConnForm.name"
            placeholder="输入连接名称（如：办公室 Telnet 设备）"
            prefix="User"
          />
        </el-form-item>
        <el-form-item label="协议类型" prop="type">
          <el-select v-model="newConnForm.type" placeholder="选择协议">
            <el-option label="Telnet" value="telnet" />
            <el-option label="SSH" value="ssh" disabled />
            <!-- 预留 SSH 选项 -->
          </el-select>
        </el-form-item>
        <el-form-item label="服务器地址" prop="host">
          <el-input
            v-model="newConnForm.host"
            placeholder="输入 IP 地址或域名（如：192.168.1.100）"
            prefix="Monitor"
          />
        </el-form-item>
        <el-form-item label="端口" prop="port">
          <el-input
            v-model.number="newConnForm.port"
            placeholder="输入端口（Telnet 默认 23，测试用 2323）"
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
        <el-button @click="isCreateDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="submitNewConn">确认保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 1. Vue 内置 API：从 vue 导入
import { ref, onMounted } from 'vue'
// 2. Element Plus 组件/工具：从 element-plus 导入
import { ElMessage, ElForm, ElMessageBox } from 'element-plus'
import TelnetTerminal from './components/TelnetTerminal.vue'
import CustomTitleBar from './components/CustomTitleBar.vue'

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

// 提交新建连接表单
const submitNewConn = async () => {
  if (!connFormRef.value) return

  try {
    await connFormRef.value.validate()
    // 1. 提交新连接
    await window.electronStore.addConnection({
      // 显式转换为纯数据对象，避免响应式属性
      name: newConnForm.value.name,
      type: newConnForm.value.type,
      host: newConnForm.value.host,
      port: newConnForm.value.port,
      username: newConnForm.value.username
    })
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
const deleteConnection = async (id: number) => {
  try {
    // 显示确认对话框
    await ElMessageBox.confirm('确定要删除这个连接吗？', '确认删除', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
      center: true
    })

    // 用户确认后执行删除操作
    const newConnections = await window.electronStore.deleteConnection(id)
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
  background: #242424;
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
  margin-bottom: 12px;
  border-radius: 8px !important;
  overflow: hidden;
}

.connection-info {
  padding: 12px;
}

.conn-name {
  font-size: 16px;
  font-weight: 500;
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
  justify-content: flex-end;
  padding: 8px 12px;
  border-top: 1px solid #3a3a3a;
  background: #333;
}

.connection-actions button {
  margin-left: 8px;
}

.terminal-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  color: #aaa;
  font-size: 14px;
}

/* Element Plus 弹窗表单样式适配 */
.el-dialog {
  background: #2d2d2d !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #e0e0e0 !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #ccc !important;
}

.el-input,
.el-select {
  --el-input-bg-color: #333 !important;
  --el-input-text-color: #e0e0e0 !important;
  --el-input-placeholder-color: #888 !important;
  --el-border-color: #444 !important;
}

.el-input:focus-within,
.el-select:focus-within {
  --el-border-color: #42b983 !important;
}
</style>
