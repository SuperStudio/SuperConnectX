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
        <!-- 自定义选项卡栏 -->
        <div v-if="connectionTabs.length > 0" class="custom-tabs">
          <div class="tabs-header" ref="tabsHeaderRef" @wheel="handleTabsWheel">
            <div class="tabs-nav">
              <div
                v-for="tab in connectionTabs"
                :key="tab.id"
                class="tab-item"
                :class="{ active: activeTabId === tab.id.toString(), pinned: pinnedTabs.has(tab.id) }"
                @click="switchTabById(tab.id)"
                @contextmenu="handleTabContextMenu($event, tab)"
              >
                <span
                  v-if="tab.connectionType !== 'commandEditor'"
                  class="connection-dot"
                  :class="getConnectionStatus(tab)"
                ></span>
                <span class="tab-name" :title="tab.name || `${tab.host || tab.comName}:${tab.port || ''}`">
                  {{ tab.name || `${tab.host || tab.comName}:${tab.port || ''}` }}
                </span>
                <span class="tab-close" @click.stop="closeTab(tab.id.toString())">×</span>
              </div>
            </div>
          </div>
          <!-- 右键菜单 -->
          <Teleport to="body">
            <div
              v-if="showTabMenu"
              class="tab-context-menu"
              :style="{ left: tabMenuPosition.x + 'px', top: tabMenuPosition.y + 'px' }"
              @click.stop
            >
              <div v-if="hasAnyConnected" class="menu-item" @click="disconnectAllTabs">断开全部</div>
              <div v-else class="menu-item" @click="connectAllTabs">连接全部</div>
              <div class="menu-divider"></div>
              <div class="menu-item" @click="closeSingleTab(rightClickedTab)">关闭</div>
              <div class="menu-item" @click="closeOtherTabs">关闭其它</div>
              <div class="menu-item" @click="closeLeftTabs">关闭左边所有</div>
              <div class="menu-item" @click="closeRightTabs">关闭右边所有</div>
              <div class="menu-item danger" @click="closeAllTabs">关闭全部</div>
              <div class="menu-divider"></div>
              <div class="menu-item" @click="moveTabToFirst">移到最前</div>
              <div class="menu-item" @click="moveTabToLast">移到最后</div>
              <div class="menu-divider"></div>
              <div class="menu-item" @click="togglePinTab">
                {{ pinnedTabs.has(rightClickedTab?.id) ? '取消固定' : '固定' }}
              </div>
            </div>
            <div v-if="showTabMenu" class="menu-overlay" @click="hideTabMenu"></div>
          </Teleport>

          <!-- 选项卡内容 -->
          <div class="tabs-content">
            <template v-for="tab in connectionTabs" :key="tab.id">
              <ComTerminal
                v-if="tab.connectionType === 'com'"
                v-show="activeTabId === tab.id.toString()"
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
                v-if="tab.connectionType === 'telnet'"
                v-show="activeTabId === tab.id.toString()"
                :connection="tab"
                :ref="(el: any) => { if (el) telnetTerminalRefs[tab.id] = el as any }"
                @onClose="handleTerminalClose(tab.id)"
                @commandSent="handleCommandSent"
                @openCommandEditor="openCommandEditorTab"
                class="telnet-terminal"
              />
              <CommandEditor
                v-if="tab.connectionType === 'commandEditor'"
                v-show="activeTabId === tab.id.toString()"
                :connection-type="tab.editorConnectionType"
                class="command-editor-terminal"
              />
            </template>
          </div>
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
import { ref, onMounted, watch, reactive, computed, nextTick } from 'vue'
import { ElMessage, ElForm, ElMessageBox, ElTabs } from 'element-plus'
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
const tabsHeaderRef = ref<HTMLElement | null>(null)
const telnetTerminalRefs = reactive<Record<string, any>>({})
const comTerminalRefs = reactive<Record<string, any>>({})
const activeTabId = ref('')

// 右键菜单相关状态
const showTabMenu = ref(false)
const tabMenuPosition = ref({ x: 0, y: 0 })
const rightClickedTab = ref<any>(null)

// 选项卡滚轮滚动处理
const handleTabsWheel = (e: WheelEvent) => {
  if (tabsHeaderRef.value) {
    e.preventDefault()
    tabsHeaderRef.value.scrollLeft += e.deltaY
  }
}

// 根据 ID 切换选项卡
const switchTabById = (tabId: string | number) => {
  activeTabId.value = tabId.toString()
  setTimeout(() => {
    const id = tabId.toString()
    if (comTerminalRefs[id]) {
      comTerminalRefs[id]?.refreshLayout?.()
    } else if (telnetTerminalRefs[id]) {
      telnetTerminalRefs[id]?.refreshLayout()
    }
  }, 0)
}

// 右键菜单处理
const handleTabContextMenu = (e: MouseEvent, tab: any) => {
  e.preventDefault()
  rightClickedTab.value = tab
  tabMenuPosition.value = { x: e.clientX, y: e.clientY }
  showTabMenu.value = true
}

const hideTabMenu = () => {
  showTabMenu.value = false
  rightClickedTab.value = null
}

// 连接全部
const connectAllTabs = async () => {
  for (const tab of connectionTabs.value) {
    if (tab.connectionType === 'com' && !comTerminalRefs[tab.id]?.isConnected) {
      comTerminalRefs[tab.id]?.reconnect?.()
    } else if (tab.connectionType === 'telnet' && !telnetTerminalRefs[tab.id]?.isConnected) {
      telnetTerminalRefs[tab.id]?.reconnect?.()
    }
  }
  hideTabMenu()
}

// 检查是否有任何连接是打开的
const hasAnyConnected = computed(() => {
  return connectionTabs.value.some((tab) => {
    if (tab.connectionType === 'com') {
      return comTerminalRefs[tab.id]?.isConnected
    } else if (tab.connectionType === 'telnet') {
      return telnetTerminalRefs[tab.id]?.isConnected
    }
    return false
  })
})

// 断开全部
const disconnectAllTabs = async () => {
  for (const tab of connectionTabs.value) {
    const isConnected = tab.connectionType === 'com' 
      ? comTerminalRefs[tab.id]?.isConnected 
      : telnetTerminalRefs[tab.id]?.isConnected
    
    if (isConnected) {
      // 禁止自动重连
      if (tab.connectionType === 'com') {
        comTerminalRefs[tab.id]?.preventAutoReconnect?.()
      } else {
        telnetTerminalRefs[tab.id]?.preventAutoReconnect?.()
      }
      
      await window.connectApi.stopConnect({
        ...TelnetInfo.buildWithValue(tab),
        sessionId: tab.sessionId
      })
    }
  }
  hideTabMenu()
}

// 关闭指定选项卡
const closeSingleTab = async (tab: any) => {
  await closeTab(tab.id.toString(), true) // 强制关闭
  hideTabMenu()
}

// 关闭其它
const closeOtherTabs = async () => {
  if (!rightClickedTab.value) return
  const tabsToClose = connectionTabs.value.filter(t => t.id !== rightClickedTab.value.id)
  for (const tab of tabsToClose) {
    await closeTabOnly(tab.id.toString()) // 使用批量关闭模式，不触发断开消息
  }
  hideTabMenu()
}

// 关闭左边所有
const closeLeftTabs = async () => {
  if (!rightClickedTab.value) return
  const currentIndex = connectionTabs.value.findIndex(t => t.id === rightClickedTab.value.id)
  const tabsToClose = connectionTabs.value.slice(0, currentIndex)
  for (const tab of tabsToClose) {
    await closeTabOnly(tab.id.toString()) // 使用批量关闭模式
  }
  hideTabMenu()
}

// 关闭右边所有
const closeRightTabs = async () => {
  if (!rightClickedTab.value) return
  const currentIndex = connectionTabs.value.findIndex(t => t.id === rightClickedTab.value.id)
  const tabsToClose = connectionTabs.value.slice(currentIndex + 1)
  for (const tab of tabsToClose) {
    await closeTabOnly(tab.id.toString()) // 使用批量关闭模式
  }
  hideTabMenu()
}

// 关闭全部
const closeAllTabs = async () => {
  for (const tab of [...connectionTabs.value]) {
    await closeTabOnly(tab.id.toString()) // 使用批量关闭模式
  }
  hideTabMenu()
}

// 移到最前
const moveTabToFirst = () => {
  if (!rightClickedTab.value) return
  const index = connectionTabs.value.findIndex(t => t.id === rightClickedTab.value.id)
  if (index > 0) {
    const tab = connectionTabs.value.splice(index, 1)[0]
    connectionTabs.value.unshift(tab)
  }
  hideTabMenu()
}

// 移到最后
const moveTabToLast = () => {
  if (!rightClickedTab.value) return
  const index = connectionTabs.value.findIndex(t => t.id === rightClickedTab.value.id)
  if (index < connectionTabs.value.length - 1) {
    const tab = connectionTabs.value.splice(index, 1)[0]
    connectionTabs.value.push(tab)
  }
  hideTabMenu()
}

// 固定/取消固定（这里简化处理，固定只是阻止关闭）
const pinnedTabs = reactive<Set<string>>(new Set())
const togglePinTab = () => {
  if (!rightClickedTab.value) return
  const tabId = rightClickedTab.value.id
  if (pinnedTabs.has(tabId)) {
    pinnedTabs.delete(tabId)
  } else {
    pinnedTabs.add(tabId)
  }
  hideTabMenu()
}

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

// 关闭单个选项卡（批量关闭模式）
const closeTabOnly = async (tabId: string) => {
  const tab = connectionTabs.value.find((t) => t.id === tabId)
  if (!tab) return

  // 先从标签列表中移除（销毁组件，移除监听器，避免触发断开消息）
  connectionTabs.value = connectionTabs.value.filter((t) => t.id !== tabId)

  // 如果关闭的是当前激活的标签，切换到最后一个标签
  if (activeTabId.value === tabId && connectionTabs.value.length > 0) {
    activeTabId.value = connectionTabs.value[connectionTabs.value.length - 1].id.toString()
  }

  // 如果是 COM 口连接，更新连接状态
  if (tab.connectionType === 'com' && tab.comName) {
    delete connectedSerialPorts[tab.comName]
  }

  // 移除固定标记
  pinnedTabs.delete(tabId)

  // 断开连接
  await window.connectApi.stopConnect({
    ...TelnetInfo.buildWithValue(tab),
    sessionId: tab.sessionId
  }).catch(() => {})
}

// 关闭选项卡逻辑调整
const closeTab = async (tabId, force = false) => {
  // 如果选项卡被固定且不是强制关闭，则不关闭
  if (pinnedTabs.has(tabId) && !force) {
    ElMessage.warning('此选项卡已固定，请先取消固定')
    return
  }

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

    // 移除固定标记
    pinnedTabs.delete(tabId)
  }

  // 从标签列表中移除
  connectionTabs.value = connectionTabs.value.filter((tab) => tab.id !== tabId)

  // 如果关闭的是当前激活的标签，切换到最后一个标签
  if (activeTabId.value === tabId.toString() && connectionTabs.value.length > 0) {
    activeTabId.value = connectionTabs.value[connectionTabs.value.length - 1].id.toString()
  }
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

/* 自定义选项卡样式 */
.custom-tabs {
  height: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  background-color: #1e1e1e;
}

.tabs-header {
  height: 32px;
  background: #252526;
  flex-shrink: 0;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-gutter: stable;
}

.tabs-header::-webkit-scrollbar {
  height: 4px;
}

.tabs-header::-webkit-scrollbar-track {
  background: transparent;
}

.tabs-header::-webkit-scrollbar-thumb {
  background: #464647;
  border-radius: 2px;
}

.tabs-header::-webkit-scrollbar-thumb:hover {
  background: #6f6f70;
}

.tabs-nav {
  display: flex;
  align-items: stretch;
  height: 100%;
  white-space: nowrap;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 36px 0 10px;
  min-width: 100px;
  max-width: 160px;
  height: 100%;
  background-color: #2d2d2d;
  color: #ccc;
  cursor: pointer;
  user-select: none;
  position: relative;
  border-right: 1px solid #1e1e1e;
}

.tab-item:hover {
  background-color: #353535;
}

.tab-item.active {
  background-color: #1e1e1e;
  color: #fff;
}

.tab-item .tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.tab-item .connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.tab-item .connection-dot.connected {
  background-color: #18c138;
}

.tab-item .connection-dot.disconnected {
  background-color: #888888;
}

/* 串口列表连接状态圆点 */
.serial-port-left .connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.serial-port-left .connection-dot.connected {
  background-color: #18c138;
}

.serial-port-left .connection-dot.disconnected {
  background-color: #888888;
}

.tab-close {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  line-height: 18px;
  text-align: center;
  font-size: 16px;
  color: #888;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;
}

.tab-item:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background-color: #3b3c3c;
  color: #fff;
}

.tabs-content {
  flex: 1;
  overflow: hidden;
}

.telnet-terminal {
  width: 100%;
  height: 100%;
}

.command-editor-terminal {
  width: 100%;
  height: 100%;
}

/* 右键菜单样式 */
.tab-context-menu {
  position: fixed;
  background: #252526;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  z-index: 9999;
}

.menu-item {
  padding: 6px 16px;
  cursor: pointer;
  color: #ccc;
  font-size: 13px;
  white-space: nowrap;
}

.menu-item:hover {
  background: #094771;
  color: #fff;
}

.menu-item.danger {
  color: #f56c6c;
}

.menu-item.danger:hover {
  background: #f56c6c;
  color: #fff;
}

.menu-divider {
  height: 1px;
  background: #3a3a3a;
  margin: 4px 0;
}

.menu-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9998;
}

/* 固定选项卡样式 */
.tab-item.pinned::after {
  content: '';
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 3px;
  background: #409eff;
}
</style>
