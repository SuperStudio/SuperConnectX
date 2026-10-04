<template>
  <SidebarLayout
    class="connection-list-wrapper"
    :visible="showConnectionList"
    :width="sidebarWidth"
  >
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
          <!-- 串口分组（常驻显示：无串口时保留刷新入口和空态提示） -->
          <div class="connection-group" data-testid="serial-port-group">
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
                @contextmenu.prevent="$emit('serialPortContextMenu', { event: $event, port })"
              >
                <div class="serial-port-content">
                  <div class="serial-port-left">
                    <span
                      class="connection-dot"
                      :class="isSerialPortConnected(port.path) ? 'connected' : 'disconnected'"
                    ></span>
                    <div class="serial-port-info">
                      <el-tooltip
                        :disabled="!showSerialPortDetails || !hasPortDetails(port)"
                        :show-after="TOOLTIP_SHOW_AFTER"
                        placement="right"
                        effect="dark"
                        :enterable="false"
                      >
                        <template #content>
                          <div class="port-detail-tooltip">
                            <div v-if="port.friendlyName" class="port-detail-row"><span class="port-detail-label">{{ t('sidebar.friendlyName') }}:</span> {{ port.friendlyName }}</div>
                            <div v-if="port.manufacturer" class="port-detail-row"><span class="port-detail-label">{{ t('sidebar.manufacturer') }}:</span> {{ port.manufacturer }}</div>
                            <div v-if="port.vendorId || port.productId" class="port-detail-row"><span class="port-detail-label">VID/PID:</span> {{ port.vendorId || '-' }}/{{ port.productId || '-' }}</div>
                            <div v-if="port.serialNumber" class="port-detail-row"><span class="port-detail-label">{{ t('sidebar.serialNumber') }}:</span> {{ port.serialNumber }}</div>
                            <div v-if="port.pnpId" class="port-detail-row"><span class="port-detail-label">PnP ID:</span> {{ port.pnpId }}</div>
                            <div v-if="port.locationId" class="port-detail-row"><span class="port-detail-label">{{ t('sidebar.locationId') }}:</span> {{ port.locationId }}</div>
                          </div>
                        </template>
                        <div class="serial-port-device" tabindex="0">
                          <div class="serial-port-row">
                            <span class="conn-name" :title="port.path">{{ getSerialPortDisplayName(port.path) }}</span>
                            <span v-if="showPortType" class="serial-port-type">
                              <el-tag v-if="port.type === 'virtual'" type="info" size="small" effect="dark">{{ t('sidebar.virtual') }}</el-tag>
                              <el-tag v-else-if="port.type === 'usb'" type="success" size="small" effect="dark">{{ t('sidebar.usb') }}</el-tag>
                              <el-tag v-else-if="port.type === 'bluetooth'" class="bluetooth-tag" size="small" effect="dark">{{ t('sidebar.bluetooth') }}</el-tag>
                              <el-tag v-else type="info" size="small" effect="dark">{{ t('sidebar.noType') }}</el-tag>
                            </span>
                          </div>
                          <span
                            v-if="showSerialPortFriendlyName && getPortFriendlyName(port)"
                            class="serial-friendly-name"
                            :title="getPortFriendlyName(port)"
                          >{{ getPortFriendlyName(port) }}</span>
                        </div>
                      </el-tooltip>
                      <el-tooltip v-if="serialRemarks[port.path]" :content="serialRemarks[port.path]" placement="top" effect="dark" :enterable="false" :show-after="TOOLTIP_SHOW_AFTER">
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

    <template #footer>
      <!-- 侧边栏底部工具栏：基础层 SidebarFooter（品牌 + 设置菜单，菜单项经 i18n 注入） -->
      <SidebarFooter
        brand="SuperStudio"
        :menu-title="t('sidebar.settings')"
        :items="sidebarMenuItems"
        @command="handleSidebarMenuCommand"
      />
    </template>
  </SidebarLayout>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import SearchInput from '../../components/SearchInput.vue'
import { TOOLTIP_SHOW_AFTER } from '../../utils/constants'
import SidebarLayout from '@superx/foundation/shell/SidebarLayout.vue'
import SidebarFooter from '@superx/foundation/shell/SidebarFooter.vue'
import { getSerialPortDisplayName } from './useConnectionSidebar'

const { t } = useI18n()

const props = defineProps<{
  showConnectionList: boolean
  sidebarWidth: number
  serialPorts: SerialPortInfo[]
  filteredSerialPorts: SerialPortInfo[]
  serialPortExpanded: boolean
  showPortType: boolean
  showSerialPortFriendlyName: boolean
  showSerialPortDetails: boolean
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
  serialPortContextMenu: [data: { event: MouseEvent; port: SerialPortInfo }]
}>()

const sidebarMenuItems = computed(() => [
  { id: 'settings', label: t('sidebar.settings') },
  { id: 'shortcuts', label: t('sidebar.shortcuts') },
  { divider: true },
  { id: 'plugins', label: t('sidebar.plugins') },
  { id: 'checkUpdate', label: t('sidebar.checkUpdate') },
  { divider: true },
  { id: 'about', label: t('titlebar.about') }
])

const handleSidebarMenuCommand = (command: string) => {
  emit('sidebarMenuCommand', command)
}

const getPortFriendlyName = (port: SerialPortInfo): string => {
  const friendlyName = port.friendlyName?.trim()
  if (!friendlyName) return ''
  const escapedPath = port.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return friendlyName.replace(new RegExp(`\\s*\\(${escapedPath}\\)\\s*$`, 'i'), '').trim()
}

const hasPortDetails = (port: SerialPortInfo): boolean => {
  return !!(
    port.friendlyName ||
    port.manufacturer ||
    port.vendorId ||
    port.productId ||
    port.serialNumber ||
    port.pnpId ||
    port.locationId
  )
}

const toggleGroupExpanded = (type: string) => {
  emit('sidebarMenuCommand', '__toggleGroup__' + type)
}
</script>

<style scoped>
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
  min-width: 0;
  flex: 1;
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
  width: 100%;
  max-width: none;
  align-self: stretch;
  box-sizing: border-box;
  padding: 0 !important;
  margin-top: 6px;
  min-height: auto !important;
}

.serial-port-card :deep(.el-card__body) {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  min-height: 56px;
  padding: 8px 10px !important;
  overflow: hidden;
}

.serial-port-content {
  position: relative;
  display: flex;
  width: 100%;
  justify-content: space-between;
  align-items: center;
  overflow: hidden;
}

.serial-port-left {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 8px;
}

.serial-port-info {
  flex: 1;
  min-width: 0;
}

.serial-port-device {
  min-width: 0;
  overflow: hidden;
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
}

.serial-port-left .connection-dot.connected {
  background-color: var(--connect-dot-connected);
}

.serial-port-left .connection-dot.disconnected {
  background-color: var(--connect-dot-disconnected);
}

.serial-port-right {
  position: absolute;
  z-index: 2;
  top: 50%;
  right: -2px;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  padding-left: 14px;
  background: linear-gradient(90deg, transparent 0, var(--sidebar-card-bg) 14px);
  transition: opacity 0.2s ease, visibility 0.2s ease;
}

.serial-port-card:hover .serial-port-right {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}

.serial-port-btn {
  padding: 4px 8px !important;
  font-size: 12px !important;
  background-color: transparent !important;
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

.serial-friendly-name {
  display: block;
  color: var(--sidebar-remark);
  font-size: 12px;
  font-weight: normal;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.port-detail-tooltip {
  max-width: 360px;
  font-size: 12px;
  line-height: 1.8;
}

.port-detail-row {
  overflow-wrap: anywhere;
}

.port-detail-label {
  color: var(--text-muted, #aaa);
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
</style>
