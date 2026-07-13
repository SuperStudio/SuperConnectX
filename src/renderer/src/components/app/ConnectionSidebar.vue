<template>
  <div class="connection-list-wrapper" :class="{ collapsed: !showConnectionList }" :style="showConnectionList ? { width: sidebarWidth + 'px' } : {}">
    <div class="connection-list">
      <!-- 固定区域：新建连接 + 搜索 -->
      <div class="connection-list-fixed">
        <el-button class="btn-primary" icon="Plus" @click="$emit('openCreateDialog')">
          {{ t('sidebar.newConnection') }}
        </el-button>
        <SearchInput @search="$emit('search', $event)" />
      </div>

      <!-- 可滚动区域：连接分组列表 -->
      <div class="connection-list-scroll">
        <div class="connection-groups">
          <!-- 串口分组 -->
          <div class="connection-group" v-if="serialPorts.length > 0">
            <div class="section-header" @click="$emit('update:serialPortExpanded', !serialPortExpanded)">
              <span class="section-title">
                <el-icon class="expand-icon" :class="{ collapsed: !serialPortExpanded }"><ArrowRight /></el-icon>
                COM ({{ filteredSerialPorts.length }})
              </span>
              <el-button type="text" icon="Refresh" @click.stop="$emit('loadSerialPorts')" size="small" class="icon-text-button">
                {{ t('common.refresh') }}
              </el-button>
            </div>
            <div class="connection-group-list" v-show="serialPortExpanded">
              <el-card
                shadow="never"
                class="connection-card serial-port-card"
                v-for="port in filteredSerialPorts"
                :key="port.path"
                @dblclick="$emit('connectToSerialPort', port)"
              >
                <div class="serial-port-content">
                  <div class="serial-port-left">
                    <span
                      class="connection-dot"
                      :class="isSerialPortConnected(port.path) ? 'connected' : 'disconnected'"
                    ></span>
                    <div class="serial-port-info">
                      <div class="serial-port-row">
                        <span class="conn-name">{{ port.path }}</span>
                        <span v-if="showPortType" class="serial-port-type">
                          <el-tag v-if="port.type === 'virtual'" type="info" size="small" effect="dark">{{ t('sidebar.virtual') }}</el-tag>
                          <el-tag v-else-if="port.type === 'usb'" type="success" size="small" effect="dark">{{ t('sidebar.usb') }}</el-tag>
                          <el-tag v-else-if="port.type === 'bluetooth'" class="bluetooth-tag" size="small" effect="dark">{{ t('sidebar.bluetooth') }}</el-tag>
                          <el-tag v-else type="info" size="small" effect="dark">{{ t('sidebar.noType') }}</el-tag>
                        </span>
                      </div>
                      <el-tooltip v-if="serialRemarks[port.path]" :content="serialRemarks[port.path]" placement="top" effect="dark" :enterable="false" :show-after="500">
                        <span class="serial-remark">{{ serialRemarks[port.path] }}</span>
                      </el-tooltip>
                    </div>
                  </div>
                  <div class="serial-port-right">
                    <el-button
                      v-if="!isSerialPortConnected(port.path)"
                      type="text"
                      class="icon-text-button serial-port-btn"
                      icon="Link"
                      @click="$emit('connectToSerialPort', port)"
                    >{{ t('common.connect') }}</el-button>
                    <el-button
                      v-else
                      type="text"
                      class="icon-text-button serial-port-btn disconnect-btn"
                      icon="Close"
                      @click="$emit('disconnectSerialPort', port.path)"
                    >{{ t('common.disconnect') }}</el-button>
                  </div>
                </div>
              </el-card>
              <div v-if="filteredSerialPorts.length === 0" class="no-ports-tip">{{ t('sidebar.noPorts') }}</div>
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
              @click="toggleGroupExpanded(type)"
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
                :class="{ 'has-ribbon': conn.connectionType === 'ftp' && conn.ftpMode === 'server' }"
                v-for="conn in conns"
                :key="conn.id"
                @dblclick="$emit('connectToServer', conn)"
              >
                <div v-if="conn.connectionType === 'ftp' && conn.ftpMode === 'server'" class="ribbon-badge">服务端</div>
                <div class="connection-info">
                  <div class="conn-name">{{ conn.name }}</div>
                  <div class="conn-detail">
                    <span>{{ t('sidebar.address') }}: {{ conn.host }}:{{ conn.port }}</span>
                    <span v-if="conn.username">{{ t('sidebar.user') }}: {{ conn.username }}</span>
                  </div>
                </div>
                <div class="connection-actions">
                  <div class="connection-btn">
                    <el-button type="text" class="el-button--primary" icon="Link" @click="$emit('connectToServer', conn)">
                      {{ t('common.connect') }}
                    </el-button>
                  </div>
                  <div class="connection-btn">
                    <el-button class="el-button--primary" type="text" style="color: var(--sidebar-edit-color)" icon="edit" @click="$emit('editCreateDialog', conn)">
                      {{ t('common.edit') }}
                    </el-button>
                  </div>
                  <div class="connection-btn">
                    <el-button type="text" class="el-button--primary" icon="Delete" @click="$emit('deleteConnection', conn)" style="color: var(--sidebar-delete-color)">
                      {{ t('common.delete') }}
                    </el-button>
                  </div>
                </div>
              </el-card>
            </div>
          </div>
          <div v-if="Object.keys(connectionGroups).length === 0 && connections.length > 0" class="no-ports-tip">
            {{ t('sidebar.noConnections') }}
          </div>
        </div>
      </div>
    </div>

    <!-- 侧边栏底部工具栏 -->
    <div class="sidebar-footer">
      <span class="sidebar-brand">SuperStudio</span>
      <div class="sidebar-menu-wrapper">
        <div class="sidebar-menu-btn" @click.stop="showSidebarMenu = !showSidebarMenu" :class="{ active: showSidebarMenu }">
          <svg viewBox="0 0 1024 1024" fill="currentColor" width="16" height="16">
            <path d="M919.6 405.6l-57.2-8c-12.7-1.8-23-10.4-28-22.1-11.3-26.7-25.7-51.7-42.9-74.5-7.7-10.2-10-23.5-5.2-35.3l21.7-53.5c6.7-16.4 0.2-35.3-15.2-44.1L669.1 96.6c-15.4-8.9-34.9-5.1-45.8 8.9l-35.4 45.3c-7.9 10.2-20.7 14.9-33.5 13.3-14-1.8-28.3-2.8-42.8-2.8-14.5 0-28.8 1-42.8 2.8-12.8 1.6-25.6-3.1-33.5-13.3l-35.4-45.3c-10.9-14-30.4-17.8-45.8-8.9L230.4 168c-15.4 8.9-21.8 27.7-15.2 44.1l21.7 53.5c4.8 11.9 2.5 25.1-5.2 35.3-17.2 22.8-31.7 47.8-42.9 74.5-5 11.8-15.3 20.4-28 22.1l-57.2 8C86 408 72.9 423 72.9 440.8v142.9c0 17.7 13.1 32.7 30.6 35.2l57.2 8c12.7 1.8 23 10.4 28 22.1 11.3 26.7 25.7 51.7 42.9 74.5 7.7 10.2 10 23.5 5.2 35.3l-21.7 53.5c-6.7 16.4-0.2 35.3 15.2 44.1L354 927.8c15.4 8.9 34.9 5.1 45.8-8.9l35.4-45.3c7.9-10.2 20.7-14.9 33.5-13.3 14 1.8 28.3 2.8 42.8 2.8 14.5 0 28.8-1 42.8-2.8 12.8-1.6 25.6 3.1 33.5 13.3l35.4 45.3c10.9 14 30.4 17.8 45.8 8.9l123.7-71.4c15.4-8.9 21.8-27.7 15.2-44.1l-21.7-53.5c-4.8-11.8-2.5-25.1 5.2-35.3 17.2-22.8 31.7-47.8 42.9-74.5 5-11.8 15.3-20.4 28-22.1l57.2-8c17.6-2.5 30.6-17.5 30.6-35.2V440.8c0.2-17.8-12.9-32.8-30.5-35.2z m-408 245.5c-76.7 0-138.9-62.2-138.9-138.9s62.2-138.9 138.9-138.9 138.9 62.2 138.9 138.9-62.2 138.9-138.9 138.9z"/>
          </svg>
        </div>
        <div class="dropdown-menu" ref="sidebarMenuRef" v-if="showSidebarMenu" @click.stop>
          <div class="menu-item" @click="$emit('sidebarMenuCommand', 'settings')">{{ t('sidebar.settings') }}</div>
          <div class="menu-item" @click="$emit('sidebarMenuCommand', 'shortcuts')">{{ t('sidebar.shortcuts') }}</div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="$emit('sidebarMenuCommand', 'plugins')">{{ t('sidebar.plugins') }}</div>
          <div class="menu-item" @click="$emit('sidebarMenuCommand', 'checkUpdate')">{{ t('sidebar.checkUpdate') }}</div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="$emit('sidebarMenuCommand', 'about')">{{ t('titlebar.about') }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchInput from '../SearchInput.vue'

const { t } = useI18n()

const props = defineProps<{
  showConnectionList: boolean
  sidebarWidth: number
  serialPorts: SerialPortInfo[]
  filteredSerialPorts: SerialPortInfo[]
  serialPortExpanded: boolean
  showPortType: boolean
  connectionGroups: Record<string, any[]>
  connectionGroupExpanded: Record<string, boolean>
  serialRemarks: Record<string, string>
  connections: any[]
  isSerialPortConnected: (path: string) => boolean
}>()

const emit = defineEmits<{
  'update:serialPortExpanded': [value: boolean]
  openCreateDialog: []
  search: [keyword: string]
  loadSerialPorts: []
  connectToSerialPort: [port: SerialPortInfo]
  disconnectSerialPort: [path: string]
  connectToServer: [conn: any]
  editCreateDialog: [conn: any]
  deleteConnection: [conn: any]
  sidebarMenuCommand: [command: string]
}>()

const showSidebarMenu = ref(false)
const sidebarMenuRef = ref(null) as Ref<HTMLElement | null>

const handleClickOutside = (e: MouseEvent) => {
  if (sidebarMenuRef.value && !sidebarMenuRef.value.contains(e.target as Node)) {
    showSidebarMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside, true)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside, true)
})

const toggleGroupExpanded = (type: string) => {
  emit('sidebarMenuCommand', '__toggleGroup__' + type)
}
</script>

<style scoped>
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

.connection-list-wrapper.collapsed {
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  border-right: none;
}

.connection-list {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-primary);
  background: var(--bg-secondary);
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
  background: var(--scrollbar-thumb-dark);
  border-radius: 4px;
}

.connection-list-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-dark-hover);
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

.connection-card {
  background: var(--sidebar-card-bg) !important;
  border: 1px solid var(--sidebar-card-border) !important;
  margin-top: 12px;
  border-radius: 8px !important;
  overflow: hidden;
  position: relative;
  cursor: pointer;
  transition: border-color 0.2s ease !important;
}

.connection-card :deep(.el-card__body) {
  padding: 12px 12px 0 12px !important;
  overflow-x: hidden;
}

.connection-card:hover {
  border: 1px solid var(--sidebar-card-hover-border) !important;
}

.connection-info {
  user-select: none;
  overflow-x: hidden;
}

.conn-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-secondary);
  display: inline-block;
  width: 80px;
  flex-shrink: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conn-detail {
  font-size: 13px;
  color: var(--text-muted);
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
  border-top: 1px solid var(--divider-dark);
  flex-shrink: 0;
}

.connection-actions button {
  margin-left: 8px;
}

.connection-btn:deep(.el-button--primary) {
  background-color: transparent;
  padding: 5px;
}

.connection-btn:deep(.el-button--primary:hover) {
  background-color: var(--sidebar-btn-hover-bg);
}

/* 斜角绑带式标签 */
.connection-card.has-ribbon {
  overflow: hidden;
}

.ribbon-badge {
  position: absolute;
  top: 8px;
  right: -28px;
  width: 110px;
  padding: 2px 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--sidebar-ribbon-text);
  background-color: var(--sidebar-ribbon-bg);
  text-align: center;
  transform: rotate(45deg);
  transform-origin: center;
  z-index: 1;
  box-shadow: var(--sidebar-ribbon-shadow);
  letter-spacing: 1px;
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
  align-items: flex-start;
  gap: 8px;
}

.serial-port-info {
  flex: 1;
  min-width: 0;
}

.serial-port-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.serial-port-left .connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 6px;
}

.serial-port-left .connection-dot.connected {
  background-color: var(--connect-dot-connected);
}

.serial-port-left .connection-dot.disconnected {
  background-color: var(--connect-dot-disconnected);
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

.disconnect-btn {
  color: var(--sidebar-disconnect-color) !important;
}

.disconnect-btn:hover {
  color: var(--sidebar-disconnect-hover) !important;
}

.serial-port-card:hover {
  border: 1px solid var(--accent-blue) !important;
  box-shadow: var(--sidebar-card-hover-shadow) !important;
}

.serial-remark {
  display: block;
  color: var(--sidebar-remark);
  font-size: 13px;
  font-weight: normal;
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.serial-port-type {
  margin-top: 4px;
  margin-left: 22px;
  font-size: 11px;
}

.serial-port-type .el-tag {
  font-size: 10px;
  padding: 0 4px;
  height: 16px;
  line-height: 14px;
}

.bluetooth-tag {
  background-color: var(--sidebar-bluetooth-bg) !important;
  border-color: var(--sidebar-bluetooth-border) !important;
  color: var(--text-white) !important;
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
  color: var(--sidebar-section-header-hover);
}

.section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
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
  color: var(--sidebar-remark);
  font-size: 12px;
  text-align: center;
  padding: 8px 0;
}

/* 侧边栏底部工具栏 */
.sidebar-footer {
  flex-shrink: 0;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  border-top: 1px solid var(--sidebar-footer-border);
  background: var(--sidebar-footer-bg);
}

.sidebar-brand {
  color: var(--text-sidebar-brand);
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
  color: var(--sidebar-menu-btn);
  cursor: pointer;
  transition: all 0.15s;
}

.sidebar-menu-btn:hover,
.sidebar-menu-btn.active {
  background-color: var(--sidebar-menu-btn-hover-bg);
  color: var(--sidebar-menu-btn-hover-color);
}

.dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
}

.dropdown-menu .menu-item {
  font-size: 12px;
  color: var(--menu-item-color);
  transition: background-color 0.15s ease, color 0.15s ease;
}

.dropdown-menu .menu-item:hover {
  background-color: var(--menu-item-hover-bg);
  color: var(--menu-item-hover-color);
}
</style>
