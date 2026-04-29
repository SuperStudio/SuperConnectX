<template>
  <div class="app-container">
    <CustomTitleBar
      @toggle-connection-list="toggleConnectionList"
      @refreshCommands="refreshHandler"
      @change-font="handleFontChange"
      @change-font-size="handleFontSizeChange"
      @open-about="isAboutDialogOpen = true"
      :show-connection-list="showConnectionList"
    />
    <!-- 主内容区：左侧连接列表 + 右侧终端 -->
    <main class="app-main">
      <div class="connection-list-wrapper" :class="{ collapsed: !showConnectionList }">
        <div class="connection-list">
          <!-- 固定区域：新建连接 + 搜索 -->
          <div class="connection-list-fixed">
            <el-button type="primary" class="vscode-btn" icon="Plus" @click="openCreateDialog"
              >新建连接</el-button
            >
            <SearchInput @search="handleSearch" />
          </div>

          <!-- 可滚动区域：连接分组列表 -->
          <div class="connection-list-scroll">
          <!-- 连接列表 - 按协议分组 -->
          <div class="connection-groups">
            <!-- 串口分组 -->
            <div class="connection-group" v-if="serialPorts.length > 0">
              <div class="section-header" @click="serialPortExpanded = !serialPortExpanded">
                <span class="section-title">
                  <el-icon class="expand-icon" :class="{ collapsed: !serialPortExpanded }"><ArrowRight /></el-icon>
                  COM ({{ filteredSerialPorts.length }})
                </span>
                <el-button type="text" icon="Refresh" @click.stop="loadSerialPorts" size="small"
                  >刷新</el-button
                >
              </div>
              <div class="connection-group-list" v-show="serialPortExpanded">
                <el-card
                  shadow="never"
                  class="connection-card serial-port-card"
                  v-for="port in filteredSerialPorts"
                  :key="port.path"
                  @dblclick="connectToSerialPort(port)"
                >
                  <div class="serial-port-content">
                    <div class="serial-port-left">
                      <span
                        class="connection-dot"
                        :class="isSerialPortConnected(port.path) ? 'connected' : 'disconnected'"
                      ></span>
                      <div class="conn-name">{{ port.path }}</div>
                    </div>
                    <div class="serial-port-right">
                      <el-button
                        v-if="!isSerialPortConnected(port.path)"
                        type="text"
                        class="el-button--primary serial-port-btn"
                        icon="Link"
                        @click="connectToSerialPort(port)"
                      >连接</el-button>
                      <el-button
                        v-else
                        type="text"
                        class="el-button--danger serial-port-btn"
                        icon="Close"
                        @click="disconnectSerialPort(port.path)"
                      >断开</el-button>
                    </div>
                  </div>
                </el-card>
                <div v-if="filteredSerialPorts.length === 0" class="no-ports-tip">无匹配串口</div>
              </div>
            </div>

            <!-- 其他协议分组 -->
            <div
              v-for="(conns, type) in connectionGroups"
              :key="type"
              class="connection-group"
            >
              <div
                class="section-header"
                @click="connectionGroupExpanded[type] = !connectionGroupExpanded[type]"
              >
                <span class="section-title">
                  <el-icon class="expand-icon" :class="{ collapsed: !connectionGroupExpanded[type] }"><ArrowRight /></el-icon>
                  {{ type.toUpperCase() }} ({{ conns.length }})
                </span>
              </div>
              <div class="connection-group-list" v-show="connectionGroupExpanded[type]">
                <el-card
                  shadow="never"
                  class="connection-card"
                  v-for="conn in conns"
                  :key="conn.id"
                  @dblclick="connectToServer(conn)"
                >
                  <div class="connection-info">
                    <div class="conn-name">{{ conn.name }}</div>
                    <div class="conn-detail">
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
            <div v-if="Object.keys(connectionGroups).length === 0 && connections.length > 0" class="no-ports-tip">
              无匹配连接
            </div>
          </div>
          </div>
        </div>
      </div>
      <div class="terminal-wrapper" :class="{ expanded: !showConnectionList }">
        <div v-if="connectionTabs.length > 0" class="tabs-container">
          <el-tabs
            v-model="activeTabId"
            type="card"
            closable
            @tab-remove="closeTab"
            @tab-click="switchTab"
            draggable
            class="telnet-tabs"
          >
            <el-tab-pane
              v-for="tab in connectionTabs"
              :key="tab.id"
              :name="tab.id.toString()"
              class="telnet-tab-pane"
            >
              <template #label>
                <span class="tab-label" :title="tab.connectionType === 'telnet' ? `${tab.host}:${tab.port}` : tab.comName">
                  <span
                    v-if="tab.connectionType !== 'commandEditor'"
                    class="connection-dot"
                    :class="getConnectionStatus(tab)"
                  ></span>
                  <span class="tab-title">{{ tab.name || `${tab.host || tab.comName}:${tab.port || ''}` }}</span>
                </span>
              </template>
              <ComTerminal
                v-if="tab.connectionType === 'com'"
                :connection="tab"
                :ref="(el: any) => { if (el) comTerminalRefs[tab.id] = el as any }"
                :auto-connect="true"
                @onClose="handleTerminalClose(tab.id)"
                @commandSent="handleCommandSent"
                @onConnect="(_sessionId: any) => { if (tab.comName) connectedSerialPorts[tab.comName] = true }"
                @onDisconnect="(_sessionId: any) => { if (tab.comName) delete connectedSerialPorts[tab.comName] }"
                @openCommandEditor="openCommandEditorTab"
                class="telnet-terminal"
              />
              <TelnetTerminal
                v-else-if="tab.connectionType === 'telnet'"
                :connection="tab"
                :ref="(el: any) => { if (el) telnetTerminalRefs[tab.id] = el as any }"
                @onClose="handleTerminalClose(tab.id)"
                @commandSent="handleCommandSent"
                @openCommandEditor="openCommandEditorTab"
                class="telnet-terminal"
              />
              <CommandEditor
                v-else-if="tab.connectionType === 'commandEditor'"
                :connection-type="tab.editorConnectionType"
                class="command-editor-terminal"
              />
            </el-tab-pane>
          </el-tabs>
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
      @keydown.enter.native="submitNewConn"
      :close-on-click-modal="false"
    >
      <el-form :model="newConnForm" :rules="newConnRules" ref="connFormRef" label-width="120px">
        <el-form-item label="协议类型" prop="connectionType">
          <el-select
            v-model="newConnForm.connectionType"
            @change="handleProtocolChange"
            placeholder="选择协议"
          >
            <el-option label="Telnet" value="telnet" />
            <el-option label="SSH" value="ssh" disabled />
            <el-option label="FTP" value="ftp" />
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
        <el-form-item label="密码" prop="password" v-if="newConnForm.connectionType === 'ftp'">
          <el-input v-model="newConnForm.password" placeholder="输入密码" type="password" />
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

    <!-- 关于弹窗 -->
    <AboutDialog v-model:modelValue="isAboutDialogOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, reactive, computed } from 'vue'
import { ElMessage, ElForm, ElMessageBox } from 'element-plus'
import TelnetTerminal from './components/TelnetTerminal.vue'
import ComTerminal from './components/ComTerminal.vue'
import CustomTitleBar from './components/CustomTitleBar.vue'
import SearchInput from './components/SearchInput.vue'
import ResourceMonitor from './components/ResourceMonitor.vue'
import AboutDialog from './components/AboutDialog.vue'
import CommandEditor from './components/CommandEditor.vue'
import TelnetInfo from './entity/protocol/TelnetInfo'

const searchKeyword = ref('')
const filterConnection = ref<any[]>([])
const connections = ref<any[]>([])
const isCreateDialogOpen = ref(false)
const isAboutDialogOpen = ref(false)
const connFormRef = ref<InstanceType<typeof ElForm> | null>(null)
const newConnForm = reactive(TelnetInfo.build())
const showConnectionList = ref(true)
const lastSentCommand = ref('')
// 新增选项卡相关状态
const connectionTabs = ref<any[]>([])
const telnetTerminalRefs = reactive<Record<string, any>>({})
const comTerminalRefs = reactive<Record<string, any>>({})
const activeTabId = ref('')
// 串口相关状态
const serialPorts = ref<SerialPortInfo[]>([])
const connectedSerialPorts = reactive<Record<string, boolean>>({})
const serialPortExpanded = ref(true)
const filteredSerialPorts = computed(() => {
  if (!searchKeyword.value) return serialPorts.value
  const keyword = searchKeyword.value.toLowerCase()
  return serialPorts.value.filter((port) => port.path.toLowerCase().includes(keyword))
})
// 连接分组相关状态
const connectionGroupExpanded = ref<Record<string, boolean>>({
  telnet: true,
  ftp: true,
  ssh: true
})
const connectionGroups = computed(() => {
  const groups: Record<string, any[]> = {}
  filterConnection.value.forEach((conn) => {
    const type = conn.connectionType || 'other'
    if (!groups[type]) groups[type] = []
    groups[type].push(conn)
  })
  return groups
})
const refreshHandler = () => {
  if (activeTabId.value) {
    const tabId = activeTabId.value
    if (comTerminalRefs[tabId]) {
      comTerminalRefs[tabId]?.refreshGroupsCmds?.()
    } else {
      telnetTerminalRefs[tabId]?.refreshGroupsCmds()
    }
  }
}

const newConnRules = computed(() => {
  return {}
})

const handleProtocolChange = (value) => {
  // 清空密码（切换非FTP时）
  if (value !== 'ftp') {
    newConnForm.password = ''
  }

  // 自动设置默认端口
  switch (value) {
    case 'ftp':
      newConnForm.port = 21 // FTP默认21
      break
    case 'telnet':
      newConnForm.port = 23 // Telnet默认23
      break
    default:
      newConnForm.port = 0 // 其他协议清空端口
      break
  }
}

const filtereList = () => {
  if (!searchKeyword.value) {
    filterConnection.value = connections.value
    return
  }
  const keyword = searchKeyword.value.toLowerCase()
  filterConnection.value = connections.value.filter(
    (item) =>
      item.name?.toLowerCase().includes(keyword) ||
      item.connectionType?.toLowerCase().includes(keyword) ||
      item.host?.toLowerCase().includes(keyword) ||
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

const setConnFormData = (defaultData) => {
  newConnForm.id = defaultData.id
  newConnForm.name = defaultData.name
  newConnForm.connectionType = defaultData.connectionType
  newConnForm.host = defaultData.host
  newConnForm.port = defaultData.port
  newConnForm.username = defaultData.username
  newConnForm.password = defaultData.password
}

const openCreateDialog = () => {
  setConnFormData(TelnetInfo.build())
  if (connFormRef.value) {
    connFormRef.value.clearValidate()
  }
  isCreateDialogOpen.value = true
}

const editCreateDialog = (conn) => {
  setConnFormData(TelnetInfo.buildWithValue(conn))
  isCreateDialogOpen.value = true
}

const submitNewConn = async () => {
  if (!connFormRef.value) return

  try {
    await connFormRef.value.validate()
    if (newConnForm.id) {
      await window.storageApi.updateConnection(TelnetInfo.buildWithValue(newConnForm))
    } else {
      await window.storageApi.addConnection(TelnetInfo.buildWithValue(newConnForm))
    }

    loadConnections()
    isCreateDialogOpen.value = false
    ElMessage.success(`连接 "${newConnForm.name}" 已保存`)
  } catch (error: any) {
    console.error(error)
    // 检查是否是重复连接错误
    if (error?.message?.includes('已存在相同的连接')) {
      ElMessage.error('该连接已存在，请修改连接名称或地址')
    } else {
      ElMessage.error('请完善表单信息并修正错误')
    }
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

const connectToServer = async (conn) => {
  const sessionId = Date.now() + Math.floor(Math.random() * 1000)
  const newTab = {
    ...TelnetInfo.buildWithValue(conn),
    sessionId: sessionId, // 新增会话ID用于区分相同连接的不同标签
    id: `${conn.id}-${sessionId}` // 组合ID确保标签唯一
  }

  // 添加到标签列表
  connectionTabs.value.push(newTab)
  activeTabId.value = newTab.id.toString()
}

// 关闭选项卡逻辑调整
const closeTab = async (tabId) => {
  // 找到对应的标签
  const tab = connectionTabs.value.find((t) => t.id === tabId)
  if (tab) {
    // 断开对应的会话连接
    await window.connectApi.stopConnect({
      ...TelnetInfo.buildWithValue(tab),
      sessionId: tab.sessionId
    })

    // 如果是 COM 口连接，更新连接状态
    if (tab.connectionType === 'com' && tab.comName) {
      delete connectedSerialPorts[tab.comName]
    }
  }

  // 从标签列表中移除
  connectionTabs.value = connectionTabs.value.filter((tab) => tab.id !== tabId)

  // 如果关闭的是当前激活的标签，切换到最后一个标签
  if (activeTabId.value === tabId.toString() && connectionTabs.value.length > 0) {
    activeTabId.value = connectionTabs.value[connectionTabs.value.length - 1].id.toString()
  }
}

const switchTab = (tab: any) => {
  activeTabId.value = tab.paneName
  setTimeout(() => {
    const tabId = tab.paneName
    if (comTerminalRefs[tabId]) {
      comTerminalRefs[tabId]?.refreshLayout?.()
    } else {
      telnetTerminalRefs[tabId]?.refreshLayout()
    }
  }, 0)
}

const handleTerminalClose = async (connId: string | number) => {
  closeTab(connId.toString())
}

const handleFontChange = (fontFamily: string) => {
  if (activeTabId.value) {
    const tabId = activeTabId.value
    if (comTerminalRefs[tabId]) {
      comTerminalRefs[tabId]?.handleFontChange?.(fontFamily)
    } else {
      telnetTerminalRefs[tabId]?.handleFontChange(fontFamily)
    }
  }
}

const handleFontSizeChange = (action: string) => {
  if (activeTabId.value) {
    const tabId = activeTabId.value
    if (comTerminalRefs[tabId]) {
      comTerminalRefs[tabId]?.handleFontSizeChange?.(action)
    } else {
      telnetTerminalRefs[tabId]?.handleFontSizeChange(action)
    }
  }
}

const getConnectionStatus = (tab: any) => {
  if (tab.connectionType === 'com') {
    return comTerminalRefs[tab.id]?.isConnected ? 'connected' : 'disconnected'
  }
  return telnetTerminalRefs[tab.id]?.isConnected ? 'connected' : 'disconnected'
}

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

// 串口相关函数
const loadSerialPorts = async () => {
  try {
    const ports = await window.connectApi.listSerialPorts()
    serialPorts.value = ports
    console.log('已扫描串口:', ports)
  } catch (error) {
    console.error('扫描串口失败:', error)
    serialPorts.value = []
  }
}

const isSerialPortConnected = (path: string) => !!connectedSerialPorts[path]

const connectToSerialPort = async (port: SerialPortInfo) => {
  // 检查是否已存在该串口的选项卡
  const existingTab = connectionTabs.value.find((t) => t.comName === port.path && t.connectionType === 'com')
  if (existingTab) {
    // 已存在，选中并尝试重连
    activeTabId.value = existingTab.id
    // 等待组件渲染完成后调用重连
    setTimeout(() => {
      comTerminalRefs[existingTab.id]?.reconnect?.()
    }, 100)
    return
  }

  // 使用串口名称作为 sessionId
  const sessionId = port.path
  const newTabId = `com-${sessionId}`
  const newTab = {
    connectionType: 'com',
    name: port.path,
    comName: port.path,
    baudRate: 9600,
    host: '',
    port: 0,
    username: '',
    password: '',
    sessionId: sessionId,
    id: newTabId
  }

  // 直接添加 tab，让 ComTerminal 自己负责连接
  connectionTabs.value.push(newTab)
  activeTabId.value = newTabId
  connectedSerialPorts[port.path] = true
}

const disconnectSerialPort = async (path: string) => {
  const tab = connectionTabs.value.find((t) => t.comName === path && t.connectionType === 'com')
  if (tab) {
    await window.connectApi.stopConnect({
      connectionType: 'com',
      comName: tab.comName,
      sessionId: tab.sessionId
    })
    delete connectedSerialPorts[path]
  }
}

// 打开命令编辑器选项卡
const openCommandEditorTab = (connectionType: string = 'telnet') => {
  // 获取协议类型的显示名称
  const typeDisplayName = connectionType.toUpperCase()
  
  // 检查是否已存在该协议类型的命令编辑器选项卡
  const existingTab = connectionTabs.value.find(
    (t) => t.connectionType === 'commandEditor' && t.name === `编辑命令-${typeDisplayName}`
  )
  if (existingTab) {
    activeTabId.value = existingTab.id
    return
  }

  const newTabId = 'commandEditor-' + Date.now()
  const newTab = {
    connectionType: 'commandEditor',
    name: `编辑命令-${typeDisplayName}`,
    editorConnectionType: connectionType,
    id: newTabId,
    sessionId: newTabId
  }

  connectionTabs.value.push(newTab)
  activeTabId.value = newTabId
}

onMounted(() => {
  loadConnections()
  loadSerialPorts()

  // 监听连接意外断开，更新串口连接状态
  window.connectApi.onConnectClose((sessionId: number | string) => {
    const tab = connectionTabs.value.find((t) => String(t.sessionId) === String(sessionId))
    if (tab && tab.connectionType === 'com') {
      delete connectedSerialPorts[tab.comName]
    }
  })
})
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
  height: 100%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #333;
  background: #252526;
}

.connection-list-fixed {
  flex-shrink: 0;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.connection-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px 8px 8px;
}

.connection-list-scroll::-webkit-scrollbar {
  width: 8px;
}

.connection-list-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.connection-list-scroll::-webkit-scrollbar-thumb {
  background: #464647;
  border-radius: 4px;
}

.connection-list-scroll::-webkit-scrollbar-thumb:hover {
  background: #6f6f70;
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

.connection-card :deep(.el-card__body) {
  padding: 12px 12px 0 12px !important;
}

.connection-card {
  cursor: pointer;
}

.connection-card:hover {
  border: 1px solid rgb(64, 158, 255) !important;
  transform: translateY(-2px);
}

.connection-info {
  user-select: none;
}

/* 串口卡片样式 */
.serial-port-card {
  padding: 0 !important;
  margin-top: 6px;
  min-height: auto !important;
}

.serial-port-card :deep(.el-card__body) {
  padding: 8px 12px !important;
}

.serial-port-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.serial-port-left {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.serial-port-right {
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.serial-port-card:hover .serial-port-right {
  opacity: 1;
}

.serial-port-btn {
  padding: 4px 8px !important;
  font-size: 12px !important;
}

.serial-port-card:hover {
  border: 1px solid #409eff !important;
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.3) !important;
  transform: translateY(-1px) !important;
}

.conn-name {
  font-size: 16px;
  font-weight: 600;
  color: #e0e0e0;
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
  padding: 8px 0;
  margin-top: 8px;
  border-top: 1px solid #3a3a3a;
}

.connection-actions button {
  margin-left: 8px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  cursor: pointer;
  user-select: none;
}

.section-header:hover .section-title {
  color: #409eff;
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: #e0e0e0;
}

.expand-icon {
  transition: transform 0.2s;
  margin-right: 4px;
}

.expand-icon.collapsed {
  transform: rotate(0deg);
}

.expand-icon:not(.collapsed) {
  transform: rotate(90deg);
}

.no-ports-tip {
  color: #888;
  font-size: 12px;
  text-align: center;
  padding: 8px 0;
}

.connection-groups {
  margin-top: 12px;
}

.connection-group {
  margin-bottom: 8px;
}

.connection-group-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.el-dialog {
  background: #252526 !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #f0f0f0 !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #e8e8e8 !important;
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
  font-size: 15px;
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

.terminal-wrapper {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.tabs-container {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
  background-color: #1e1e1e;
}

.telnet-tabs {
  height: 100%;
  width: 100%;
  --el-tabs-padding: 0 !important;
  display: flex;
  flex-direction: column;
}

.telnet-tabs :deep(.el-tabs__header) {
  margin: 0 !important;
  border: none !important;
  background: #252526;
  height: 32px;
  flex-shrink: 0;
}

.telnet-tabs :deep(.el-tabs__content) {
  flex: 1;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  overflow: hidden;
}

.telnet-tab-pane {
  height: 100%;
  width: 100%;
  margin: 0 !important;
  padding: 0 !important;
  display: flex;
  flex-direction: column;
}

/* 选项卡标签样式 */
.tab-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tab-title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.connection-dot.connected {
  background-color: #18c138;
}

.connection-dot.disconnected {
  background-color: #888888;
}

.telnet-terminal {
  width: 100%;
  height: 100%;
}

/* 选项卡美化样式 */
.telnet-tabs :deep(.el-tabs__nav) {
  background-color: #1e1e1e;
  border: none;
  height: 100%;
  display: flex;
  align-items: stretch;
}

.telnet-tabs :deep(.el-tabs__item) {
  color: #ccc;
  background-color: #2d2d2d;
  border: none !important;
  border-radius: 0px;
  margin: 0px;
  padding: 0 16px;
  padding-right: 40px !important;
  height: auto;
  display: flex;
  align-items: center;
  transition: none !important;
}

.telnet-tabs :deep(.el-tabs__item.is-active) {
  color: #fff;

  border: none;
}

/* 标签内容样式 */
.tab-label-container {
  display: flex;
  align-items: center;
}

.tab-name {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-tab {
  background-color: #1e1e1e !important;
  border: none;
}

/* 标签栏头部：移除原有 border-bottom，重置所有边框 */
.telnet-tabs :deep(.el-tabs__header) {
  margin: 0 !important;
  border: none !important; /* 移除底部边框 + 所有边框 */
  background: #252526;
  padding-left: 0px;
  height: 32px;
}

.telnet-tabs :deep(.el-tabs__nav) {
  background-color: transparent;
  border: none; /* 确保导航区无边框 */
  height: 32px;
}

/* 单个选项卡：移除所有 border 相关样式 */
.telnet-tabs :deep(.el-tabs__item) {
  color: #ccc;
  background-color: #2d2d2d;
  border: none !important;
  border-left: none !important;
  border-right: none !important;
  border-bottom: none !important;
  border-radius: 0px;
  margin: 0px;
  padding: 0 16px !important;
  padding-right: 45px !important;
  height: 32px;
  line-height: 32px;
  min-width: 150px;
  transition: none !important;
  position: relative !important;
  box-sizing: border-box !important;
  overflow: hidden !important;
}

/* 激活的选项卡：移除 border 相关，仅保留底部高亮条（可选，若不需要也可删除） */
.telnet-tabs :deep(.el-tabs__item.is-active) {
  color: #fff;
  background-color: #1e1e1e;
  border: none !important; /* 移除激活态的边框 */
  border-bottom-color: transparent !important; /* 确保底部无框 */
  font-weight: 500;
}

/* 内容区域样式 */
.telnet-tabs :deep(.el-tabs__content) {
  flex: 1;
  height: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  border: none !important; /* 确保内容区无边框 */
  overflow: hidden;
}

/* 激活的选项卡额外样式：移除 border 相关 */
.active-tab {
  background-color: #1e1e1e !important;
  border: none !important;
}

/* 选项卡基础样式 */
.telnet-tabs {
  height: 100%;
  width: 100%;
  --el-tabs-padding: 0 !important;
  /* 新增：重置 Element Plus 内置的边框变量 */
  --el-tabs-border-color: transparent !important;
  --el-tabs-header-border-color: transparent !important;
}

/* 针对 el-tabs__nav.is-top 及父元素的边框清零 */
.telnet-tabs :deep(.el-tabs__nav-wrap) {
  border: none !important;
}
.telnet-tabs :deep(.el-tabs__nav.is-top) {
  border: none !important;
  border-bottom: none !important; /* 重点：强制移除顶部导航的底部边框 */
}
/* 移除 Element Plus 自带的激活条（如果不需要） */
.telnet-tabs :deep(.el-tabs__active-bar) {
  display: none !important; /* 或设置为 height: 0 !important */
}
/* 移除所有可能的伪元素边框 */
.telnet-tabs :deep(.el-tabs__nav.is-top)::before,
.telnet-tabs :deep(.el-tabs__nav.is-top)::after {
  border: none !important;
  content: none !important;
}

.telnet-tabs :deep(.el-tabs__header .el-tabs__item .is-icon-close) {
  opacity: 0 !important;
  pointer-events: none !important;
  width: 25px !important;
  height: 25px !important;
  border-radius: 2px;
  position: absolute !important;
  right: 8px !important;
  top: 50% !important;
  transform: translateY(-50%) !important;
  margin: 0 !important;
  padding: 0 !important;
  background: transparent !important;
  transition: opacity 0.15s ease !important;
  z-index: 1;
}

.telnet-tabs :deep(.el-tabs__header .el-tabs__item .is-icon-close:hover) {
  background-color: #3b3c3c !important;
}

.telnet-tabs :deep(.el-tabs__header .el-tabs__item.is-active .is-icon-close) {
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* 鼠标悬停时显示关闭按钮 */
.telnet-tabs :deep(.el-tabs__header .el-tabs__item:hover .is-icon-close) {
  opacity: 1 !important;
  pointer-events: auto !important;
}

/* 调整选项卡内部布局 - 核心修改 */
.telnet-tabs :deep(.el-tabs__item) {
  /* 启用弹性布局 */
  display: flex !important;
  align-items: center !important;
  justify-content: flex-start !important;
  position: relative !important;
  user-select: none;
  box-sizing: border-box;
}

/* 选项卡标签容器 */
.telnet-tabs :deep(.el-tabs__item > span:first-child) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
  min-width: 0;
  margin-right: 8px;
}

.command-editor-terminal {
  width: 100%;
  height: 100%;
}
</style>
