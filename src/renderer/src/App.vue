<template>
  <div class="app-container">
    <CustomTitleBar
      @toggle-connection-list="toggleConnectionList"
      @refreshCommands="refreshHandler"
      @change-font="handleFontChange"
      @change-font-size="handleFontSizeChange"
      @open-about="isAboutDialogOpen = true"
      :show-connection-list="showConnectionList"
      :current-font="currentFont"
    />
    <!-- 主内容区：左侧连接列表 + 右侧终端 -->
    <main class="app-main">
      <div class="connection-list-wrapper" :class="{ collapsed: !showConnectionList }" :style="showConnectionList ? { width: sidebarWidth + 'px' } : {}">
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
                      <div class="conn-name">
                        {{ port.path }}
                        <span v-if="serialRemarks[port.path]" class="serial-remark"> {{ serialRemarks[port.path] }}</span>
                      </div>
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
        <!-- 侧边栏底部工具栏 -->
        <div class="sidebar-footer">
          <span class="sidebar-brand">SuperStudio</span>
          <div class="sidebar-menu-wrapper">
            <div class="sidebar-menu-btn" @click="toggleSidebarMenu" :class="{ active: showSidebarMenu }">
              <svg viewBox="0 0 1024 1024" fill="currentColor" width="16" height="16">
                <path d="M919.6 405.6l-57.2-8c-12.7-1.8-23-10.4-28-22.1-11.3-26.7-25.7-51.7-42.9-74.5-7.7-10.2-10-23.5-5.2-35.3l21.7-53.5c6.7-16.4 0.2-35.3-15.2-44.1L669.1 96.6c-15.4-8.9-34.9-5.1-45.8 8.9l-35.4 45.3c-7.9 10.2-20.7 14.9-33.5 13.3-14-1.8-28.3-2.8-42.8-2.8-14.5 0-28.8 1-42.8 2.8-12.8 1.6-25.6-3.1-33.5-13.3l-35.4-45.3c-10.9-14-30.4-17.8-45.8-8.9L230.4 168c-15.4 8.9-21.8 27.7-15.2 44.1l21.7 53.5c4.8 11.9 2.5 25.1-5.2 35.3-17.2 22.8-31.7 47.8-42.9 74.5-5 11.8-15.3 20.4-28 22.1l-57.2 8C86 408 72.9 423 72.9 440.8v142.9c0 17.7 13.1 32.7 30.6 35.2l57.2 8c12.7 1.8 23 10.4 28 22.1 11.3 26.7 25.7 51.7 42.9 74.5 7.7 10.2 10 23.5 5.2 35.3l-21.7 53.5c-6.7 16.4-0.2 35.3 15.2 44.1L354 927.8c15.4 8.9 34.9 5.1 45.8-8.9l35.4-45.3c7.9-10.2 20.7-14.9 33.5-13.3 14 1.8 28.3 2.8 42.8 2.8 14.5 0 28.8-1 42.8-2.8 12.8-1.6 25.6 3.1 33.5 13.3l35.4 45.3c10.9 14 30.4 17.8 45.8 8.9l123.7-71.4c15.4-8.9 21.8-27.7 15.2-44.1l-21.7-53.5c-4.8-11.8-2.5-25.1 5.2-35.3 17.2-22.8 31.7-47.8 42.9-74.5 5-11.8 15.3-20.4 28-22.1l57.2-8c17.6-2.5 30.6-17.5 30.6-35.2V440.8c0.2-17.8-12.9-32.8-30.5-35.2z m-408 245.5c-76.7 0-138.9-62.2-138.9-138.9s62.2-138.9 138.9-138.9 138.9 62.2 138.9 138.9-62.2 138.9-138.9 138.9z"/>
              </svg>
            </div>
            <div class="sidebar-dropdown-menu" v-if="showSidebarMenu">
              <div class="sidebar-menu-item" @click="handleSidebarMenuCommand('options')">选项</div>
              <div class="sidebar-menu-item" @click="handleSidebarMenuCommand('plugins')">插件</div>
              <div class="sidebar-menu-item" @click="handleSidebarMenuCommand('checkUpdate')">检查更新</div>
              <div class="sidebar-menu-item" @click="handleSidebarMenuCommand('shortcuts')">快捷键</div>
              <div class="sidebar-menu-separator"></div>
              <div class="sidebar-menu-item" @click="handleSidebarMenuCommand('about')">关于</div>
            </div>
          </div>
        </div>
      </div>
      <!-- 侧边栏分隔条 -->
      <div v-if="showConnectionList" class="sidebar-resizer" @mousedown="startResize" :class="{ resizing: isResizing }"></div>
      <div class="terminal-wrapper" :class="{ expanded: !showConnectionList }">
        <!-- 自定义选项卡栏 -->
        <div v-if="connectionTabs.length > 0" class="custom-tabs">
          <div class="tabs-header" ref="tabsHeaderRef" @wheel="handleTabsWheel">
            <div class="tabs-nav" @contextmenu="handleTabsNavContextMenu">
              <div
                v-for="tab in connectionTabs"
                :key="tab.id"
                class="tab-item"
                :class="{ active: activeTabId === tab.id.toString(), pinned: pinnedTabs.has(tab.id) }"
                @click="switchTabById(tab.id); hideTabMenu()"
                @contextmenu="handleTabContextMenu($event, tab)"
                :data-tab-id="tab.id"
              >
                <span
                  v-if="tab.connectionType !== 'commandEditor' && tab.connectionType !== 'shortcuts'"
                  class="connection-dot"
                  :class="getConnectionStatus(tab)"
                ></span>
                <span class="tab-name" :title="tab.name || `${tab.host || tab.comName}:${tab.port || ''}`">
                  {{ tab.name || `${tab.host || tab.comName}:${tab.port || ''}` }}
                  <span v-if="tab.connectionType === 'com' && tab.comName && serialRemarks[tab.comName]" class="tab-remark">{{ serialRemarks[tab.comName] }}</span>
                </span>
                <span
                  class="tab-action-btn"
                  :class="{ pinned: pinnedTabs.has(tab.id) }"
                  @click.stop="togglePinTabByButton(tab.id)"
                  :title="pinnedTabs.has(tab.id) ? '取消固定' : '固定'"
                ></span>
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
              <!-- 串口备注编辑 -->
              <template v-if="rightClickedTab?.connectionType === 'com'">
                <div class="menu-divider"></div>
                <div class="menu-item" @click="openRemarkDialog">编辑备注</div>
              </template>
            </div>
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
                @remarkUpdated="(data: any) => { if (data.comName) serialRemarks[data.comName] = data.remark }"
                @fontLoaded="(font: string) => { currentFont = font }"
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
                @fontLoaded="(font: string) => { currentFont = font }"
                class="telnet-terminal"
              />
              <CommandEditor
                v-if="tab.connectionType === 'commandEditor'"
                v-show="activeTabId === tab.id.toString()"
                :connection-type="tab.editorConnectionType"
                class="command-editor-terminal"
              />
              <ShortcutsPage
                v-if="tab.connectionType === 'shortcuts'"
                v-show="activeTabId === tab.id.toString()"
                class="shortcuts-terminal"
              />
            </template>
          </div>
        </div>
        <!-- 无选项卡时的空状态显示 -->
        <div v-else class="empty-tabs-placeholder">
          <div class="logo-container">
            <img :src="logoImage" alt="SuperStudio" class="logo-img" />
            <div class="logo-text">SuperStudio</div>
            <div class="copyright">&copy; 2025 SuperStudio</div>
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

    <!-- 串口备注编辑弹窗 -->
    <el-dialog
      v-model="showRemarkDialog"
      title="编辑备注"
      width="400px"
      :close-on-click-modal="false"
      @opened="onRemarkDialogOpened"
    >
      <el-form label-width="80px" @submit.prevent>
        <el-form-item :label="editingRemarkComName">
          <el-input
            ref="remarkInputRef"
            v-model="editingRemark"
            placeholder="请输入备注名称"
            maxlength="50"
            @keydown.enter="saveSerialRemark"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showRemarkDialog = false">取消</el-button>
        <el-button type="primary" @click="saveSerialRemark">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, reactive, computed, nextTick } from 'vue'
import { ElMessage, ElForm, ElMessageBox } from 'element-plus'
import TelnetTerminal from './components/TelnetTerminal.vue'
import ComTerminal from './components/ComTerminal.vue'
import CustomTitleBar from './components/CustomTitleBar.vue'
import SearchInput from './components/SearchInput.vue'
import ResourceMonitor from './components/ResourceMonitor.vue'
import AboutDialog from './components/AboutDialog.vue'
import ShortcutsPage from './components/ShortcutsPage.vue'
import CommandEditor from './components/CommandEditor.vue'
import TelnetInfo from './entity/protocol/TelnetInfo'
import logoImage from './assets/icon.png'

const searchKeyword = ref('')
const filterConnection = ref<any[]>([])
const connections = ref<any[]>([])
const isCreateDialogOpen = ref(false)
const isAboutDialogOpen = ref(false)

// 快捷键配置
const shortcuts = ref<Array<{ action: string; keys: string[] }>>([])

// 快捷键命令映射（从后端加载）
const shortcutActions = ref<Record<string, () => void>>({})

// 侧边栏底部菜单状态
const showSidebarMenu = ref(false)

const toggleSidebarMenu = () => {
  showSidebarMenu.value = !showSidebarMenu.value
}

// 点击外部关闭侧边栏菜单
const handleClickOutsideSidebarMenu = (e: MouseEvent) => {
  const target = e.target as HTMLElement
  if (!target.closest('.sidebar-menu-wrapper')) {
    showSidebarMenu.value = false
  }
}

// 侧边栏底部菜单处理
const handleSidebarMenuCommand = async (command: string) => {
  showSidebarMenu.value = false
  switch (command) {
    case 'options':
      ElMessage.info('选项功能开发中...')
      break
    case 'plugins':
      ElMessage.info('插件功能开发中...')
      break
    case 'checkUpdate':
      ElMessage.info('已是最新版本')
      break
    case 'shortcuts':
      openShortcutsTab()
      break
    case 'about':
      isAboutDialogOpen.value = true
      break
  }
}

const connFormRef = ref<InstanceType<typeof ElForm> | null>(null)
const newConnForm = reactive(TelnetInfo.build())
const showConnectionList = ref(true)
const sidebarWidth = ref(320)
const lastSentCommand = ref('')
const MIN_SIDEBAR_WIDTH = 200 // 最小宽度阈值
// 新增选项卡相关状态
const connectionTabs = ref<any[]>([])
const tabsHeaderRef = ref<HTMLElement | null>(null)
const telnetTerminalRefs = reactive<Record<string, any>>({})
const comTerminalRefs = reactive<Record<string, any>>({})
const activeTabId = ref('')
const currentFont = ref('Fira Code') // 当前活动的字体

// 右键菜单相关状态
const showTabMenu = ref(false)
const tabMenuPosition = ref({ x: 0, y: 0 })
const rightClickedTab = ref<any>(null)

// 串口备注相关状态
const showRemarkDialog = ref(false)
const editingRemark = ref('')
const editingRemarkComName = ref('')
const serialRemarks = reactive<Record<string, string>>({}) // 缓存串口备注
const remarkInputRef = ref<any>(null)

// 选项卡滚轮滚动处理
const handleTabsWheel = (e: WheelEvent) => {
  if (tabsHeaderRef.value) {
    e.preventDefault()
    tabsHeaderRef.value.scrollLeft += e.deltaY
  }
}

// 侧边栏拖动分隔条
const isResizing = ref(false)
const resizeStartX = ref(0)
const resizeStartWidth = ref(0)

const startResize = (e: MouseEvent) => {
  isResizing.value = true
  resizeStartX.value = e.clientX
  resizeStartWidth.value = sidebarWidth.value
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

const onResize = (e: MouseEvent) => {
  if (!isResizing.value) return
  const delta = e.clientX - resizeStartX.value
  const newWidth = resizeStartWidth.value + delta
  
  // 限制在最大宽度之间
  if (newWidth <= 500) {
    // 如果宽度小于最小宽度的2/3，隐藏侧边栏
    const hideThreshold = MIN_SIDEBAR_WIDTH * 2 / 3 // 约133px
    if (newWidth < hideThreshold) {
      showConnectionList.value = false
      sidebarWidth.value = MIN_SIDEBAR_WIDTH // 记录最后宽度
    } else {
      sidebarWidth.value = newWidth
    }
  }
}

const stopResize = () => {
  if (isResizing.value) {
    isResizing.value = false
    document.removeEventListener('mousemove', onResize)
    document.removeEventListener('mouseup', stopResize)
    // 保存宽度设置
    saveSidebarState()
  }
}

// 根据 ID 切换选项卡
const switchTabById = (tabId: string | number) => {
  activeTabId.value = tabId.toString()
  // 刷新布局（字体更新由 watch 处理）
  setTimeout(() => {
    if (comTerminalRefs[tabId.toString()]) {
      comTerminalRefs[tabId.toString()]?.refreshLayout?.()
    } else if (telnetTerminalRefs[tabId.toString()]) {
      telnetTerminalRefs[tabId.toString()]?.refreshLayout?.()
    }
  }, 0)
}

// 更新当前活动的字体（带重试机制）
const updateCurrentFont = (tabId: string, retries = 5) => {
  const tryGetFont = () => {
    const comRef = comTerminalRefs[tabId]
    const telnetRef = telnetTerminalRefs[tabId]
    if (comRef || telnetRef) {
      const ref = comRef || telnetRef
      const font = ref?.getFontFamily?.()
      if (font) {
        currentFont.value = font
        return true
      }
    }
    return false
  }

  if (tryGetFont()) return

  // 如果没获取到，重试几次
  let retryCount = 0
  const retry = () => {
    retryCount++
    if (tryGetFont()) return
    if (retryCount < retries) {
      setTimeout(retry, 100)
    } else {
      // 如果所有重试都失败，设置默认字体
      currentFont.value = 'Fira Code'
    }
  }
  setTimeout(retry, 100)
}

// 监听 activeTabId 变化，更新当前字体
watch(activeTabId, (newTabId, oldTabId) => {
  if (newTabId && newTabId !== oldTabId) {
    nextTick(() => {
      updateCurrentFont(newTabId)
    })
  }
})

// 右键菜单处理
const handleTabContextMenu = (e: MouseEvent, tab: any) => {
  e.preventDefault()
  e.stopPropagation()
  rightClickedTab.value = tab
  tabMenuPosition.value = { x: e.clientX, y: e.clientY }
  showTabMenu.value = true
}

// tabs-nav 通用右键处理（备用，确保右键事件不会丢失）
const handleTabsNavContextMenu = (e: MouseEvent) => {
  // 检查是否点击在选项卡上
  const tabEl = (e.target as HTMLElement).closest('.tab-item')
  if (tabEl) {
    // 点击在选项卡上，从 DOM 中获取 tab 信息
    const tabId = tabEl.getAttribute('data-tab-id')
    const tab = connectionTabs.value.find(t => t.id === tabId)
    if (tab) {
      // 重新触发选项卡的右键菜单
      handleTabContextMenu(e, tab)
    }
  } else if (showTabMenu.value) {
    // 点击不在选项卡上，关闭菜单
    e.preventDefault()
    hideTabMenu()
  }
}

const hideTabMenu = () => {
  showTabMenu.value = false
  rightClickedTab.value = null
}

// 加载单个串口备注（从存储）
const loadSerialRemark = async (comName: string): Promise<string> => {
  if (serialRemarks[comName]) return serialRemarks[comName]
  try {
    const settings = await window.storageApi.getComSettings(comName)
    const remark = settings?.remark || ''
    serialRemarks[comName] = remark
    return remark
  } catch (error) {
    return ''
  }
}

// 预加载所有串口备注
const loadAllSerialRemarks = async () => {
  for (const port of serialPorts.value) {
    await loadSerialRemark(port.path)
  }
}

// 打开备注编辑对话框
const openRemarkDialog = async () => {
  if (!rightClickedTab.value?.comName) return
  editingRemarkComName.value = rightClickedTab.value.comName
  const tabId = rightClickedTab.value.id.toString()
  
  // 优先从缓存获取备注（保存时会更新缓存）
  if (serialRemarks[editingRemarkComName.value]) {
    editingRemark.value = serialRemarks[editingRemarkComName.value]
  } else if (comTerminalRefs[tabId]?.getRemark) {
    // 从 ComTerminal 获取备注
    editingRemark.value = comTerminalRefs[tabId].getRemark() || ''
  } else {
    // 从存储加载备注
    try {
      const settings = await window.storageApi.getComSettings(editingRemarkComName.value)
      editingRemark.value = settings?.remark || ''
    } catch (error) {
      editingRemark.value = ''
    }
  }
  showRemarkDialog.value = true
  hideTabMenu()
}

// 备注弹窗打开后聚焦并选中全部文本
const onRemarkDialogOpened = () => {
  nextTick(() => {
    const input = remarkInputRef.value?.$el?.querySelector('input')
    if (input) {
      input.focus()
      input.select()
    }
  })
}

// 保存串口备注
const saveSerialRemark = async () => {
  if (!editingRemarkComName.value) return
  
  // 更新缓存
  serialRemarks[editingRemarkComName.value] = editingRemark.value
  
  // 如果当前有对应的 ComTerminal 选项卡打开，同步更新
  if (rightClickedTab.value) {
    const tabId = rightClickedTab.value.id.toString()
    if (comTerminalRefs[tabId]?.updateRemark) {
      await comTerminalRefs[tabId].updateRemark(editingRemark.value)
      ElMessage.success('备注已保存')
      showRemarkDialog.value = false
      return
    }
  }
  
  // 否则直接保存到存储
  try {
    const currentSettings = await window.storageApi.getComSettings(editingRemarkComName.value)
    await window.storageApi.saveComSettings(editingRemarkComName.value, {
      ...currentSettings,
      remark: editingRemark.value
    })
    ElMessage.success('备注已保存')
  } catch (error) {
    console.error('保存备注失败:', error)
    ElMessage.error('保存备注失败')
  }
  showRemarkDialog.value = false
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
      // 禁止自动重连并调用组件的断开方法（更新前端状态）
      if (tab.connectionType === 'com') {
        comTerminalRefs[tab.id]?.preventAutoReconnect?.()
        comTerminalRefs[tab.id]?.disconnect?.()
      } else {
        telnetTerminalRefs[tab.id]?.preventAutoReconnect?.()
        telnetTerminalRefs[tab.id]?.disconnect?.()
      }
    }
  }
  hideTabMenu()
}

// 关闭指定选项卡
const closeSingleTab = async (tab: any) => {
  // 如果选项卡被固定，则跳过
  if (pinnedTabs.has(tab.id)) {
    hideTabMenu()
    return
  }
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
  const tabId = rightClickedTab.value.id
  const currentIndex = connectionTabs.value.findIndex(t => t.id === tabId)
  if (currentIndex === -1) return

  const isPinned = pinnedTabs.has(tabId)

  if (isPinned) {
    // 固定的：在固定列表最前
    const firstPinnedIndex = connectionTabs.value.findIndex(t => pinnedTabs.has(t.id))
    if (currentIndex !== firstPinnedIndex) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.splice(firstPinnedIndex, 0, tab)
    }
  } else {
    // 不固定的：在不固定列表最前
    // 先找到第一个不固定的索引
    let firstUnpinnedIndex = -1
    for (let i = 0; i < connectionTabs.value.length; i++) {
      if (!pinnedTabs.has(connectionTabs.value[i].id)) {
        firstUnpinnedIndex = i
        break
      }
    }
    if (firstUnpinnedIndex === -1) firstUnpinnedIndex = connectionTabs.value.length
    if (currentIndex !== firstUnpinnedIndex) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.splice(firstUnpinnedIndex, 0, tab)
    }
  }
  hideTabMenu()
}

// 移到最后
const moveTabToLast = () => {
  if (!rightClickedTab.value) return
  const tabId = rightClickedTab.value.id
  const currentIndex = connectionTabs.value.findIndex(t => t.id === tabId)
  if (currentIndex === -1) return

  const isPinned = pinnedTabs.has(tabId)

  if (isPinned) {
    // 固定的：在固定列表最后
    let lastPinnedIndex = -1
    for (let i = connectionTabs.value.length - 1; i >= 0; i--) {
      if (pinnedTabs.has(connectionTabs.value[i].id)) {
        lastPinnedIndex = i
        break
      }
    }
    if (currentIndex !== lastPinnedIndex) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.splice(lastPinnedIndex, 0, tab)
    }
  } else {
    // 不固定的：在不固定列表最后
    let lastUnpinnedIndex = -1
    for (let i = connectionTabs.value.length - 1; i >= 0; i--) {
      if (!pinnedTabs.has(connectionTabs.value[i].id)) {
        lastUnpinnedIndex = i
        break
      }
    }
    if (currentIndex !== lastUnpinnedIndex) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.splice(lastUnpinnedIndex, 0, tab)
    }
  }
  hideTabMenu()
}

// 固定/取消固定
const pinnedTabs = reactive<Set<string>>(new Set())

// 通过按钮切换固定状态或关闭（不显示右键菜单）
const togglePinTabByButton = (tabId: string | number) => {
  // 确保转换为字符串进行比较
  const id = tabId.toString()
  
  // 检查是否是固定状态（使用 JSON 序列化来比较，避免类型问题）
  const isPinned = connectionTabs.value.some(t => t.id.toString() === id && pinnedTabs.has(t.id))

  if (isPinned) {
    // 已固定：取消固定（移到最后一个固定项后面）
    const currentIndex = connectionTabs.value.findIndex(t => t.id.toString() === id)
    if (currentIndex === -1) return
    
    const getLastPinnedIndex = () => {
      let lastIndex = -1
      connectionTabs.value.forEach((tab, index) => {
        if (pinnedTabs.has(tab.id) && index > lastIndex) {
          lastIndex = index
        }
      })
      return lastIndex
    }
    
    const lastPinnedIndex = getLastPinnedIndex()
    pinnedTabs.delete(id)
    
    if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.splice(lastPinnedIndex, 0, tab)
    }
  } else {
    // 未固定：直接关闭选项卡
    closeTabOnly(id)
  }
}

// 通过右键菜单切换固定状态
const togglePinTab = () => {
  if (!rightClickedTab.value) return
  const tabId = rightClickedTab.value.id
  const id = tabId.toString()
  const currentIndex = connectionTabs.value.findIndex(t => t.id === id)
  if (currentIndex === -1) return

  // 获取最后一个固定项的位置
  const getLastPinnedIndex = () => {
    let lastIndex = -1
    connectionTabs.value.forEach((tab, index) => {
      if (pinnedTabs.has(tab.id) && index > lastIndex) {
        lastIndex = index
      }
    })
    return lastIndex
  }

  if (pinnedTabs.has(id)) {
    // 取消固定：先获取最后一个固定项的位置，再删除固定状态
    const lastPinnedIndex = getLastPinnedIndex()
    pinnedTabs.delete(id)
    
    // 移到最后一个固定项后面
    if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.splice(lastPinnedIndex, 0, tab)
    }
  } else {
    // 固定：移到所有固定项的最后
    const lastPinnedIndex = getLastPinnedIndex()
    pinnedTabs.add(id)
    
    if (lastPinnedIndex >= 0 && currentIndex !== lastPinnedIndex) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.splice(lastPinnedIndex + 1, 0, tab)
    } else if (lastPinnedIndex === -1 && currentIndex !== 0) {
      const tab = connectionTabs.value.splice(currentIndex, 1)[0]
      connectionTabs.value.unshift(tab)
    }
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

// 加载侧边栏状态（从存储恢复）
const loadSidebarState = async () => {
  try {
    const savedState = await window.storageApi.getAppSettings()
    if (savedState?.sidebar) {
      showConnectionList.value = savedState.sidebar.showConnectionList ?? true
      serialPortExpanded.value = savedState.sidebar.serialPortExpanded ?? true
      if (savedState.sidebar.sidebarWidth) {
        sidebarWidth.value = savedState.sidebar.sidebarWidth
      }
      connectionGroupExpanded.value = {
        ...connectionGroupExpanded.value,
        ...savedState.sidebar.connectionGroupExpanded
      }
    }
  } catch (error) {
    console.error('加载侧边栏状态失败:', error)
  }
}

// 保存侧边栏状态（持久化）
const saveSidebarState = async () => {
  try {
    const currentSettings = await window.storageApi.getAppSettings()
    // 深拷贝确保只传递纯数据
    const newSettings = {
      ...currentSettings,
      sidebar: {
        showConnectionList: Boolean(showConnectionList.value),
        serialPortExpanded: Boolean(serialPortExpanded.value),
        sidebarWidth: Number(sidebarWidth.value),
        connectionGroupExpanded: JSON.parse(JSON.stringify(connectionGroupExpanded.value))
      }
    }
    await window.storageApi.saveAppSettings(newSettings)
  } catch (error) {
    console.error('保存侧边栏状态失败:', error)
  }
}

// 监听侧边栏状态变化，自动保存
watch(
  [showConnectionList, serialPortExpanded, connectionGroupExpanded, sidebarWidth],
  () => {
    saveSidebarState()
  },
  { deep: true }
)

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
  // 如果选项卡被固定，则跳过
  if (pinnedTabs.has(tabId)) return

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
    currentFont.value = fontFamily
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

// 加载快捷键命令映射
const loadShortcutActions = async () => {
  try {
    const actions = await window.storageApi.getShortcutActions()
    if (actions && typeof actions === 'object') {
      // action名称到中文名称的映射
      const actionNames = actions as Record<string, string>
      // 构建action到执行函数的映射
      shortcutActions.value = {
        'Tab:newConnection': () => openCreateDialog(),
        'Tab:close': () => {
          if (activeTabId.value) {
            closeSingleTab(connectionTabs.value.find(t => t.id.toString() === activeTabId.value) || { id: activeTabId.value })
          }
        },
        'Tab:toggleConnection': () => {
          if (activeTabId.value) {
            const tab = connectionTabs.value.find(t => t.id.toString() === activeTabId.value)
            if (tab) {
              const isConnected = tab.connectionType === 'com'
                ? comTerminalRefs[tab.id]?.isConnected
                : telnetTerminalRefs[tab.id]?.isConnected
              if (isConnected) {
                closeSingleTab(tab)
              }
            }
          }
        },
        'Tab:toggleAllConnections': () => {
          if (hasAnyConnected.value) {
            disconnectAllTabs()
          } else {
            connectAllTabs()
          }
        },
        'Terminal:clear': () => {
          if (activeTabId.value) {
            const tabId = activeTabId.value
            if (comTerminalRefs[tabId]) {
              comTerminalRefs[tabId]?.clearTerminal?.()
            } else if (telnetTerminalRefs[tabId]) {
              telnetTerminalRefs[tabId]?.clearTerminal?.()
            }
          }
        },
        'Tab:pinCurrent': () => {
          if (activeTabId.value) {
            const tab = connectionTabs.value.find(t => t.id.toString() === activeTabId.value)
            if (tab) {
              rightClickedTab.value = tab
              togglePinTab()
            }
          }
        },
        'Tab:prev': () => {
          const currentIndex = connectionTabs.value.findIndex(t => t.id.toString() === activeTabId.value)
          if (currentIndex > 0) {
            const prevTab = connectionTabs.value[currentIndex - 1]
            switchTabById(prevTab.id)
          }
        },
        'Tab:next': () => {
          const currentIndex = connectionTabs.value.findIndex(t => t.id.toString() === activeTabId.value)
          if (currentIndex < connectionTabs.value.length - 1) {
            const nextTab = connectionTabs.value[currentIndex + 1]
            switchTabById(nextTab.id)
          }
        },
        'Tab:moveFirst': () => {
          if (activeTabId.value) {
            const tab = connectionTabs.value.find(t => t.id.toString() === activeTabId.value)
            if (tab) {
              rightClickedTab.value = tab
              moveTabToFirst()
            }
          }
        },
        'Tab:moveLast': () => {
          if (activeTabId.value) {
            const tab = connectionTabs.value.find(t => t.id.toString() === activeTabId.value)
            if (tab) {
              rightClickedTab.value = tab
              moveTabToLast()
            }
          }
        },
        'CommandEditor:open': () => {
          const connectionType = activeTabId.value
            ? connectionTabs.value.find(t => t.id.toString() === activeTabId.value)?.connectionType || 'telnet'
            : 'telnet'
          openCommandEditorTab(connectionType === 'com' ? 'telnet' : connectionType)
        },
        'Settings:open': () => {
          ElMessage.info('设置功能开发中...')
        },
        'ConnectionList:toggle': () => toggleConnectionList(),
        'SerialPort:refresh': () => loadSerialPorts(),
      }
    }
  } catch (error) {
    console.error('加载快捷键命令映射失败:', error)
  }
}

// 加载快捷键配置
const loadShortcuts = async () => {
  try {
    const data = await window.storageApi.getShortcuts()
    if (Array.isArray(data) && data.length > 0) {
      shortcuts.value = data
    }
  } catch (error) {
    console.error('加载快捷键失败:', error)
  }
}

// 标准化快捷键修饰键
const normalizeShortcutKey = (key: string): string => {
  const upperKey = key.toUpperCase()
  if (['CONTROL', 'CMD', 'COMMAND', 'COMMANDORCONTROL', 'SUPER', 'HYPER'].includes(upperKey)) {
    return 'Ctrl'
  }
  return key
}

// 标准化按键值用于比较
const normalizeEventKey = (e: KeyboardEvent): string[] => {
  const keys: string[] = []
  if (e.ctrlKey) keys.push('Ctrl')
  if ( e.altKey) keys.push('Alt')
  if (e.shiftKey) keys.push('Shift')
  if (e.metaKey) keys.push('Meta')
  // 添加主要按键（排除修饰键）
  const key = e.key
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
    // 标准化一些特殊键名
    let normalizedKey = key
    if (key === ' ') normalizedKey = 'Space'
    else if (key === '`') normalizedKey = '`'
    else if (key.length === 1) normalizedKey = key.toUpperCase()
    keys.push(normalizedKey)
  }
  return keys
}

// 快捷键处理
const handleShortcutKeydown = (e: KeyboardEvent) => {
  // 检查是否在输入框中（不处理快捷键）
  const target = e.target as HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  // 检查是否在对话框中（不处理快捷键）
  if (document.querySelector('.el-dialog__wrapper')) {
    return
  }

  const pressedKeys = normalizeEventKey(e)

  for (const shortcut of shortcuts.value) {
    if (!shortcut.keys || shortcut.keys.length === 0) continue

    const shortcutKeys = shortcut.keys.map(k => normalizeShortcutKey(k))

    if (pressedKeys.length === shortcutKeys.length &&
        pressedKeys.every(k => shortcutKeys.includes(k))) {
      const action = shortcutActions.value[shortcut.action]
      if (action) {
        e.preventDefault()
        action()
        return
      }
    }
  }
}

const getConnectionStatus = (tab: any) => {
  if (tab.connectionType === 'com') {
    return comTerminalRefs[tab.id]?.isConnected ? 'connected' : 'disconnected'
  }
  return telnetTerminalRefs[tab.id]?.isConnected ? 'connected' : 'disconnected'
}

const toggleConnectionList = () => {
  showConnectionList.value = !showConnectionList.value
}
const handleCommandSent = (command: string) => (lastSentCommand.value = command)

window.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'F12' || e.keyCode === 123) {
    e.preventDefault()
    window.toolApi.openDevtools()
  }
  // 处理快捷键
  handleShortcutKeydown(e)
})

watch([() => connections.value, () => searchKeyword.value], () => filtereList(), {
  immediate: true,
  deep: true
})

// 监听串口列表变化，加载备注
watch(serialPorts, async (newPorts) => {
  for (const port of newPorts) {
    if (!serialRemarks[port.path]) {
      await loadSerialRemark(port.path)
    }
  }
}, { immediate: true })

// 串口相关函数
const loadSerialPorts = async () => {
  try {
    const ports = await window.connectApi.listSerialPorts()
    serialPorts.value = ports
    console.log('已扫描串口:', ports)
    // 预加载所有串口备注（异步执行，不阻塞串口列表显示）
    loadAllSerialRemarks()
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

// 打开快捷键选项卡
const openShortcutsTab = () => {
  // 检查是否已存在快捷键选项卡
  const existingTab = connectionTabs.value.find((t) => t.connectionType === 'shortcuts')
  if (existingTab) {
    activeTabId.value = existingTab.id
    return
  }

  const newTabId = 'shortcuts-' + Date.now()
  const newTab = {
    connectionType: 'shortcuts',
    name: '快捷键',
    id: newTabId,
    sessionId: newTabId
  }

  connectionTabs.value.push(newTab)
  activeTabId.value = newTabId
}

onMounted(() => {
  // 加载侧边栏状态
  loadSidebarState()
  loadConnections()
  loadSerialPorts()
  loadShortcutActions()
  loadShortcuts()

  // 首次打开时，如果已有选项卡，需要更新字体
  if (activeTabId.value) {
    updateCurrentFont(activeTabId.value)
  }

  // 监听连接意外断开，更新串口连接状态
  window.connectApi.onConnectClose((sessionId: number | string) => {
    const tab = connectionTabs.value.find((t) => String(t.sessionId) === String(sessionId))
    if (tab && tab.connectionType === 'com') {
      delete connectedSerialPorts[tab.comName]
    }
  })

  // 文档级右键事件处理：点击空白区域关闭菜单
  document.addEventListener('contextmenu', (e: MouseEvent) => {
    const tabEl = (e.target as HTMLElement).closest('.tab-item')
    
    // 如果点击在选项卡上，让组件内的事件处理
    if (tabEl) {
      return
    }
    
    // 如果菜单打开且点击不在菜单上，关闭菜单
    if (showTabMenu.value) {
      hideTabMenu()
    }
  })
  
  // 点击其他区域关闭菜单
  document.addEventListener('click', (e: MouseEvent) => {
    const tabEl = (e.target as HTMLElement).closest('.tab-item')

    // 如果点击在选项卡上，让组件处理
    if (tabEl) {
      return
    }

    // 关闭菜单
    if (showTabMenu.value) {
      hideTabMenu()
    }

    // 关闭侧边栏底部菜单
    if (showSidebarMenu.value) {
      handleClickOutsideSidebarMenu(e)
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutsideSidebarMenu)
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
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #333;
  background: #252526;
  overflow-x: hidden;
  min-height: 0;
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
  overflow-x: hidden;
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
  overflow-x: hidden;
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
  overflow-x: hidden;
}

/* 串口卡片样式 */
.serial-port-card {
  padding: 0 !important;
  margin-top: 6px;
  min-height: auto !important;
}

.serial-port-card :deep(.el-card__body) {
  padding: 8px 12px !important;
  overflow-x: hidden;
}

.serial-port-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  overflow-x: hidden;
}

.serial-port-left {
  flex: 1;
  min-width: 0;
  overflow-x: hidden;
  display: flex;
  align-items: center;
  gap: 8px;
}

.serial-port-right {
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 0.2s ease;
  flex-shrink: 0;
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

.serial-remark {
  color: #888;
  font-size: 13px;
  font-weight: normal;
  margin-left: 4px;
}

.tab-remark {
  color: #888;
  font-size: 12px;
  font-weight: normal;
  margin-left: 4px;
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
  overflow-x: hidden;
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
  flex-shrink: 0;
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
  overflow-x: hidden;
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
  min-width: 200px;
  max-width: 500px;
  height: 100%;
  overflow: hidden;
  flex-shrink: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

/* 侧边栏底部工具栏 */
.sidebar-footer {
  flex-shrink: 0;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top: 1px solid #333;
  background: #252526;
}

.sidebar-brand {
  color: #ffc107;
  font-weight: 700;
  font-size: 13px;
}

.sidebar-menu-wrapper {
  position: relative;
}

.sidebar-menu-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  color: #888;
  cursor: pointer;
  transition: all 0.15s;
}

.sidebar-menu-btn:hover,
.sidebar-menu-btn.active {
  background-color: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
}

.sidebar-dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  width: 140px;
  background-color: #2d2d2d;
  border: 1px solid #444;
  border-radius: 4px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5);
  padding: 4px 0;
  margin-bottom: 4px;
}

.sidebar-menu-item {
  padding: 6px 16px;
  color: #e0e0e0;
  font-size: 12px;
  cursor: pointer;
  transition: background-color 0.15s;
}

.sidebar-menu-item:hover {
  background-color: #1f466e;
}

.sidebar-menu-separator {
  height: 1px;
  background-color: #444;
  margin: 4px 0;
}

.connection-list-wrapper.collapsed {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  border-right: none;
}

/* 侧边栏分隔条 */
.sidebar-resizer {
  width: 4px;
  height: 100%;
  background: transparent;
  cursor: col-resize;
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  transition: background-color 0.2s;
}

.sidebar-resizer:hover,
.sidebar-resizer.resizing {
  background-color: #409eff;
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

.tab-action-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border-radius: 3px;
  opacity: 0;
  transition: opacity 0.15s;
  cursor: pointer;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}

/* 默认显示关闭图标 */
.tab-action-btn::before {
  content: '×';
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 14px;
  line-height: 1;
  color: #888;
}

/* 固定状态显示图钉图标 */
.tab-action-btn.pinned {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1024 1024' fill='%23888'%3E%3Cpath d='M963.925333 326.997333L697.002667 60.074667a25.6 25.6 0 0 0-43.52 21.845333l14.506666 99.498667-273.066666 151.381333c-91.477333-45.738667-170.666667-36.693333-234.496 27.306667a25.941333 25.941333 0 0 0 0 36.352L327.68 563.2 57.685333 930.645333a25.6 25.6 0 0 0 35.84 35.669334l366.250667-270.677334 167.765333 167.936a25.941333 25.941333 0 0 0 36.352 0c79.530667-79.701333 58.538667-165.546667 26.965334-233.813333l152.064-273.066667 99.157333 14.165334a25.6 25.6 0 0 0 26.624-13.824 25.941333 25.941333 0 0 0-4.778667-30.037334z'/%3E%3C/svg%3E");
  background-size: 12px;
  background-position: center;
  background-repeat: no-repeat;
}

.tab-action-btn.pinned::before,
.tab-action-btn.pinned::after {
  display: none;
}

.tab-item:hover .tab-action-btn {
  opacity: 1;
}

.tab-item.active .tab-action-btn,
.tab-item.pinned .tab-action-btn {
  opacity: 1;
}

.tab-action-btn:hover {
  background-color: #3b3c3c;
}

.tab-action-btn:hover::before {
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

/* 固定选项卡样式 - 已移除左侧竖条，改为通过按钮图标显示 */

/* 无选项卡时的空状态显示 */
.empty-tabs-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #1e1e1e;
}

.logo-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.logo-container .logo-img {
  width: 96px;
  height: 96px;
  object-fit: contain;
  filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.3));
}

.logo-container .logo-text {
  font-size: 24px;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: 2px;
  text-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
}

.logo-container .copyright {
  font-size: 12px;
  color: #888;
  margin-top: 8px;
}
</style>
