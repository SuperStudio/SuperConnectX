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

          <SearchInput @search="handleSearch" v-if="filterConnection.length >= 2" />

          <el-card
            shadow="never"
            class="connection-card"
            v-for="conn in filterConnection"
            :key="conn.id"
            @dblclick="connectToServer(conn)"
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
                  v-if="activeConnection?.id !== conn.id"
                  type="text"
                  class="el-button--primary"
                  icon="Link"
                  @click="connectToServer(conn)"
                  >连接</el-button
                >
                <el-button
                  v-else
                  type="text"
                  class="el-button--primary"
                  icon="Close"
                  style="color: #ff4d4f"
                  @click="connectToServer(conn)"
                  >断开</el-button
                >
              </div>
              <div class="connection-btn">
                <el-button
                  :disabled="activeConnection?.id === conn.id && activeConnection !== null"
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
                  :disabled="activeConnection?.id === conn.id && activeConnection !== null"
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
          @commandSent="handleCommandSent"
        />
        <div class="terminal-placeholder" v-else>
          <img class="logo-img" src="./assets/icon.png" alt="App Icon" />
          <div class="terminal-placeholder-text welcome-text">欢迎使用 SuperConnectX</div>
          <div class="terminal-placeholder-text">@SuperStudio Copyright © 2025</div>
        </div>
      </div>
    </main>

    <div class="status-bar">
      <div class="resource-monitor">
        <ResourceMonitor />
      </div>
      <div class="command-status" v-if="lastSentCommand">已发送命令：{{ lastSentCommand }}</div>
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
import { ref, onMounted, watch } from 'vue'
import { ElMessage, ElForm, ElMessageBox } from 'element-plus'
import TelnetTerminal from './components/TelnetTerminal.vue'
import CustomTitleBar from './components/CustomTitleBar.vue'
import SearchInput from './components/SearchInput.vue'
import ResourceMonitor from './components/ResourceMonitor.vue'
import FormUtils from './utils/FormUtils'
import TelnetInfo from './entity/protocol/TelnetInfo'

const searchKeyword = ref('')
const filterConnection = ref<any[]>([])
const connections = ref<any[]>([])
const isCreateDialogOpen = ref(false)
const connFormRef = ref<InstanceType<typeof ElForm> | null>(null)
const newConnForm = ref(TelnetInfo.build())
const newConnRules = FormUtils.buildTelnet()
const activeConnection = ref<any>(null)
const showConnectionList = ref(true)
const lastSentCommand = ref('')

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

const handleSearch = (keyword: string) => (searchKeyword.value = keyword)
const loadConnections = async () => {
  try {
    // 强制确保返回值是数组（如果为 undefined 或非数组，默认空数组）
    const savedConn = await window.storageApi.getConnections()
    connections.value = Array.isArray(savedConn) ? savedConn : []
  } catch (e) {
    ElMessage.error('加载连接失败，请重启应用')
    console.error('加载连接失败：', e)
    // 出错时也强制设为空数组，避免后续操作报错
    connections.value = []
  }
}

const openCreateDialog = () => {
  newConnForm.value = TelnetInfo.build()
  if (connFormRef.value) {
    connFormRef.value.clearValidate()
  }
  isCreateDialogOpen.value = true
}

const editCreateDialog = (conn) => {
  newConnForm.value = TelnetInfo.buildWithValue(conn)
  isCreateDialogOpen.value = true
}

const submitNewConn = async () => {
  if (!connFormRef.value) return

  try {
    await connFormRef.value.validate()
    if (newConnForm.value.id) {
      await window.storageApi.updateConnection(TelnetInfo.buildWithValue(newConnForm.value))
    } else {
      await window.storageApi.addConnection(TelnetInfo.buildWithValue(newConnForm.value))
    }

    loadConnections()
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
    const newConnections = await window.storageApi.deleteConnection(conn.id)
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

const connectToServer = async (conn: any) => {
  if (activeConnection.value !== null) {
    if (conn.id === activeConnection.value.id) {
      await window.telnetApi.telnetDisconnect(conn.id)
      activeConnection.value = null
      ElMessage.success('连接已断开')
    } else {
      ElMessage.info('当前仅支持打开一个连接')
      return
    }

    return
  }

  activeConnection.value = conn
}

const handleTerminalClose = () => (activeConnection.value = null)
const toggleConnectionList = () => (showConnectionList.value = !showConnectionList.value)
const handleCommandSent = (command: string) => (lastSentCommand.value = command)

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'F12' || e.keyCode === 123) {
    e.preventDefault()
    window.toolApi.openDevtools()
  }
})

watch([() => connections.value, () => searchKeyword.value], () => filtereList(), {
  immediate: true,
  deep: true
})

onMounted(() => loadConnections())
</script>

<style scoped>
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

.connection-card {
  background: #2d2d2d !important;
  border: 1px solid #3a3a3a !important;
  margin-top: 12px;
  border-radius: 8px !important;
  overflow: hidden;
}

.connection-card:hover {
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
}

.connection-list-wrapper {
  width: 320px;
  min-width: 320px;
  height: 100%;
  transition: all 0.3s ease-in-out;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
}

.connection-list-wrapper.collapsed {
  width: 0;
  min-width: 0;
  border-right: none;
}

.terminal-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1e1e1e;
  color: #aaa;
  font-size: 14px;
  flex: 1;
  padding: 0px;
  transition: padding-left 0.3s ease-in-out;
  height: 100%;
  overflow: auto;
}

.connection-list {
  height: 100%;
  padding: 8px;
  overflow: auto;
  box-sizing: border-box;
  overflow-y: auto;
  overflow-x: hidden;
}

.connection-list::-webkit-scrollbar {
  width: 10px !important;
  height: 6px !important;
  background: transparent !important;
}

.connection-list::-webkit-scrollbar-track {
  background: transparent !important;
  border-radius: 3px !important;
}

.connection-list::-webkit-scrollbar-thumb {
  background: #464647 !important;
  border-radius: 0px !important;
  border: 0 !important;
  transition: background 1s ease !important;
}

.connection-list::-webkit-scrollbar-thumb:hover {
  background: #515151 !important;
  transform: scale(1.05) !important;
}

.connection-list::-webkit-scrollbar-thumb:active {
  background: #626263 !important;
}

.highlight {
  background: #fde68a;
  color: #92400e;
  padding: 0 2px;
  border-radius: 2px;
}

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
  margin-left: 5px;
  background-color: transparent;
  color: white;
  font-size: 11px;
  padding: 0px 10px;
  display: flex;

  align-items: center;
  width: fit-content;
  align-items: center;
  user-select: none;
}

.command-status {
  color: #e0e0e0;
  font-size: 12px;

  margin-left: auto;
  margin-right: 20px;

  display: flex;
  align-items: center;
  width: fit-content;
  align-items: center;
  user-select: none;
}

.terminal-placeholder {
  display: grid;
  place-items: center;
}

.terminal-placeholder-text {
  margin-top: 10px;
  align-items: center;
  font-size: 20px;
  text-shadow: 2px 2px 3px #000;
}

.welcome-text {
  color: #fff;
  font-weight: 1000;
}

.logo-img {
  width: 128px;
  height: 128px;
}
</style>
