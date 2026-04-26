<template>
  <div class="preset-commands">
    <!-- 组选择下拉框 -->
    <el-dropdown
      class="el-drop-down"
      v-model="selectedGroupId"
      @command="handleGroupCommand"
      placement="bottom-start"
    >
      <el-button type="default" size="small" class="group-selector">
        <span class="group-selector-text">{{ selectedGroupName || '暂无命令组' }}</span>
        <el-icon class="el-icon--right"> <ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu class="custom-dropdown-menu">
          <!-- 新建组选项 -->
          <el-dropdown-item command="new" class="group-menu-item new-group-item">
            <el-icon size="16" class="action-icon add-icon"><Plus /></el-icon>
            <span class="group-name-new">新建命令组</span>
          </el-dropdown-item>

          <!-- 分隔线 -->
          <el-dropdown-item disabled v-if="filteredGroups.length > 0" class="menu-divider-item">
            <div class="menu-divider"></div>
          </el-dropdown-item>

          <!-- 组列表 -->
          <el-dropdown-item
            v-for="group in filteredGroups"
            :key="group.groupId"
            :command="group.groupId"
            class="group-menu-item"
            :class="{ 'active-group': selectedGroupId === group.groupId }"
          >
            <span class="group-name">{{ group.name }}</span>
            <span class="group-type-badge">{{ group.connectionType }}</span>
            <span class="group-actions">
              <el-icon size="16" class="action-icon edit-icon" @click.stop="editGroup(group)"
                ><Edit
              /></el-icon>
              <el-icon size="16" class="action-icon delete-icon" @click.stop="deleteGroup(group)"
                ><Delete
              /></el-icon>
            </span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 新增命令按钮 -->
    <el-button
      type="primary"
      icon="Plus"
      size="small"
      @click="openAddPresetDialog"
      :disabled="!selectedGroupId"
      class="add-preset-btn"
    >
      新增命令
    </el-button>

    <!-- 命令按钮列表 -->
    <el-button
      v-for="cmd in filteredCommands"
      :key="cmd.id"
      type="default"
      size="small"
      class="preset-btn"
      :title="cmd.command"
      :class="{ looping: loopStatus[cmd.id] }"
      @click="sendPresetCommand(cmd)"
      @contextmenu.prevent="showContextMenu(cmd, $event)"
    >
      {{ cmd.name }}
      <template v-if="loopStatus[cmd.id]">🔄</template>
    </el-button>

    <!-- 组编辑对话框 -->
    <el-dialog
      :title="isEditingGroup ? '编辑命令组' : '新建命令组'"
      v-model="isGroupDialogOpen"
      width="400px"
      :close-on-click-modal="false"
      @keydown.enter.native="saveGroup"
    >
      <el-form :model="groupForm" :rules="groupRules" ref="groupFormRef" label-width="120px">
        <el-form-item label="命令组名称" prop="name">
          <el-input v-model="groupForm.name" placeholder="命令组名称" />
        </el-form-item>
        <el-form-item label="连接类型" prop="connectionType">
          <el-select v-model="groupForm.connectionType" placeholder="选择连接类型">
            <el-option label="Telnet" value="telnet" />
            <el-option label="SSH" value="ssh" disabled />
            <el-option label="FTP" value="ftp" />
          </el-select>
        </el-form-item>

        <el-form-item label="拷贝命令组" v-if="!isEditingGroup">
          <el-select v-model="groupForm.copyFromGroupId" placeholder="（可选）" clearable>
            <el-option
              v-for="group in copyableGroups"
              :key="group.groupId"
              :label="group.name"
              :value="group.groupId"
            />
          </el-select>
          <div class="form-hint">复制该组下的所有命令到新组</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="isGroupDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="saveGroup">保存</el-button>
      </template>
    </el-dialog>

    <!-- 命令编辑对话框 -->
    <el-dialog
      :title="isEditing ? '编辑命令' : '新增命令'"
      v-model="isPresetDialogOpen"
      @keydown.enter.native="savePresetCommand"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form :model="presetForm" :rules="presetRules" ref="presetFormRef" label-width="120px">
        <el-form-item label="命令名称" prop="name">
          <el-input v-model="presetForm.name" placeholder="输入命令名称" ref="nameInputRef" />
        </el-form-item>
        <el-form-item label="命令内容" prop="command">
          <el-input
            v-model="presetForm.command"
            type="textarea"
            placeholder="输入命令内容"
            :rows="4"
            input-style="background-color: #ccc;max-height: 200px;"
            class="custom-textarea"
            resize="vertical"
          />
        </el-form-item>
        <el-form-item label="循环时延(ms)" prop="delay">
          <el-input
            v-model.number="presetForm.delay"
            type="number"
            placeholder="命令发送后等待时间"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="isPresetDialogOpen = false">取消</el-button>
        <el-button type="primary" @click="savePresetCommand">保存</el-button>
      </template>
    </el-dialog>

    <!-- 右键菜单 -->
    <div
      v-if="contextMenuVisible"
      :style="{ left: contextMenuLeft + 'px', top: contextMenuTop + 'px' }"
      class="context-menu-container"
      @click.stop
      @contextmenu.prevent
    >
      <el-menu class="context-menu" mode="vertical" :collapse="false" :collapse-transition="false">
        <el-menu-item class="menu-item" @click="editPresetCommand(currentEditingCmd)">
          编辑
        </el-menu-item>
        <el-menu-item
          class="menu-item delete-item"
          @click="deletePresetCommand(currentEditingCmd.id)"
        >
          删除
        </el-menu-item>

        <el-menu-item class="menu-item" @click="toggleLoopSend(currentEditingCmd)">
          {{ loopStatus[currentEditingCmd.id] ? '取消循环' : '循环发送' }}
        </el-menu-item>
      </el-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { ElMessage, ElForm, ElInput, ElMessageBox } from 'element-plus'
import { ElSelect, ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon } from 'element-plus'
import { Plus, Edit, Delete, ArrowDown } from '@element-plus/icons-vue'
import FormUtils from '../utils/FormUtils'

// 组相关状态
const groups = ref<any[]>([])
const filteredGroups = ref<any[]>([])
const selectedGroupId = ref<number | null>(null)
const selectedGroupName = ref('')
const isGroupDialogOpen = ref(false)
const isEditingGroup = ref(false)
const currentEditingGroup = ref<any>(null)
const groupForm = FormUtils.buildGroupData()
const groupRules = FormUtils.buildGroups()
const groupFormRef = ref<InstanceType<typeof ElForm> | null>(null)

// 命令相关状态
const presetCommands = ref<any[]>([])
const filteredCommands = ref<any[]>([])
const isPresetDialogOpen = ref(false)
const isEditing = ref(false)
const currentEditingCmd = ref<any>(null)
const contextMenuVisible = ref(false)
const contextMenuLeft = ref(0)
const contextMenuTop = ref(0)

// 循环发送相关
const loopIntervals = ref<Record<number, NodeJS.Timeout>>({})
const loopStatus = ref<Record<number, boolean>>({})
const presetRules = FormUtils.buildPresetCmd()
const presetFormRef = ref<InstanceType<typeof ElForm> | null>(null)
const nameInputRef = ref<InstanceType<typeof ElInput> | null>(null)
const presetForm = ref<{
  name: string
  command: string
  delay: number
  groupId: number | null
}>({
  name: '',
  command: '',
  delay: 0,
  groupId: null
})

// 定义属性
const props = defineProps<{
  isConnected: boolean
  connection: {
    id: number
    host?: string
    port?: number
    name?: string
    connectionType?: string
    sessionId: string
  }
}>()

// 定义事件
const emit = defineEmits<{
  (e: 'commandSent', cmdName: string): void
  (e: 'commandSentContent', content: string): void
}>()

const copyableGroups = computed(() => {
  const connType = props.connection?.connectionType || 'telnet'
  return groups.value.filter(
    (group) =>
      group.groupId !== currentEditingGroup.value?.groupId && group.connectionType === connType
  )
})

const toggleLoopSend = (cmd: any) => {
  contextMenuVisible.value = false

  if (loopStatus.value[cmd.id]) {
    if (loopIntervals.value[cmd.id]) {
      clearInterval(loopIntervals.value[cmd.id])
      delete loopIntervals.value[cmd.id]
    }
    loopStatus.value[cmd.id] = false
    ElMessage.success(`已停止循环发送: ${cmd.name}`)
    return
  }

  loopStatus.value[cmd.id] = true
  sendPresetCommand(cmd)
  const intervalTime = Math.max(cmd.delay, 100)
  loopIntervals.value[cmd.id] = setInterval(() => {
    sendPresetCommand(cmd)
  }, intervalTime)

  ElMessage.success(`已开始循环发送: ${cmd.name} (间隔${intervalTime}ms)`)
}

// 加载组数据
const loadGroups = async () => {
  try {
    const savedGroups = await window.storageApi.getCommandGroups()
    groups.value = Array.isArray(savedGroups) ? savedGroups : []
    filterGroupsByConnectionType()

    if (filteredGroups.value.length > 0 && !selectedGroupId.value) {
      const firstGroup = filteredGroups.value[0]
      selectedGroupId.value = firstGroup.groupId
      selectedGroupName.value = firstGroup.name
      filterCommandsByGroup() // 同步加载该组的命令
    }
  } catch (error) {
    console.error('加载命令组失败:', error)
    ElMessage.error('加载命令组失败')
  }
}

const getCurrentConnect = () => {
  return {
    id: props.connection.id,
    host: props.connection.host,
    port: props.connection.port,
    name: props.connection.name,
    connectionType: props.connection.connectionType,
    sessionId: props.connection.sessionId
  }
}

// 根据连接类型过滤组
const filterGroupsByConnectionType = () => {
  const connType = props.connection?.connectionType || 'telnet'
  filteredGroups.value = groups.value.filter((group) => group.connectionType === connType)
  console.log(`filteredGroups`, JSON.stringify(filteredGroups.value))
  // 如果当前选中的组不在过滤列表中，清除选中状态
  if (
    selectedGroupId.value &&
    !filteredGroups.value.some((g) => g.groupId === selectedGroupId.value)
  ) {
    selectedGroupId.value = null
    selectedGroupName.value = ''
  }
}

// 加载命令数据
const loadPresetCommands = async () => {
  try {
    const savedCommands = await window.storageApi.getPresetCommands()
    presetCommands.value = Array.isArray(savedCommands) ? savedCommands : []
    filterCommandsByGroup()
  } catch (error) {
    console.error('加载预设命令失败:', error)
    ElMessage.error('加载预设命令失败')
  }
}

// 根据选中的组过滤命令
const filterCommandsByGroup = () => {
  filteredCommands.value = selectedGroupId.value
    ? presetCommands.value.filter((cmd) => cmd.groupId === selectedGroupId.value)
    : []
}

// 处理组选择
const handleGroupCommand = (command: string | number) => {
  if (command === 'new') {
    openAddGroupDialog()
    return
  }

  selectedGroupId.value = Number(command)
  const selected = groups.value.find((g) => g.groupId === selectedGroupId.value)
  if (selected) {
    selectedGroupName.value = selected.name
  }
  filterCommandsByGroup()
}

// 打开新增组对话框
const openAddGroupDialog = () => {
  isEditingGroup.value = false
  currentEditingGroup.value = null
  groupForm.value = {
    name: '',
    connectionType: props.connection?.connectionType || 'telnet',
    copyFromGroupId: null
  }
  isGroupDialogOpen.value = true
}

// 编辑组
const editGroup = (group: any) => {
  isEditingGroup.value = true
  currentEditingGroup.value = group
  groupForm.value = {
    name: group.name,
    connectionType: group.connectionType,
    copyFromGroupId: null
  }
  isGroupDialogOpen.value = true
}

// 删除组
const deleteGroup = async (group: any) => {
  try {
    await ElMessageBox.confirm(`确认删除 ${group.name} 及其所有命令?`, '删除组', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
      center: true
    })

    await window.storageApi.deleteCommandGroup(group.groupId)
    // 删除组关联的命令
    await Promise.all(
      presetCommands.value
        .filter((cmd) => cmd.groupId === group.groupId)
        .map((cmd) => window.storageApi.deletePresetCommand(cmd.id))
    )

    ElMessage.success('命令组已删除')
    loadGroups()
    loadPresetCommands()

    // 如果删除的是当前选中的组，清除选中状态
    if (selectedGroupId.value === group.groupId) {
      selectedGroupId.value = null
      selectedGroupName.value = ''
    }
  } catch (error) {
    console.error('删除命令组失败:', error)
    ElMessage.error('删除命令组失败')
  }
}

const focusInput = () => {
  nextTick(() => {
    const focusInput = () => {
      const inputElement = nameInputRef.value?.$el.querySelector('input')
      inputElement?.focus()
    }
    focusInput()
    setTimeout(focusInput, 50)
  })
}

// 保存组
const saveGroup = async () => {
  if (!groupFormRef.value) return

  try {
    await groupFormRef.value.validate()

    const groupData = {
      name: groupForm.value.name.trim(),
      connectionType: groupForm.value.connectionType
    }

    if (isEditingGroup.value && currentEditingGroup.value) {
      await window.storageApi.updateCommandGroup({
        groupId: currentEditingGroup.value.groupId,
        ...groupData
      })
      ElMessage.success('命令组已更新')
    } else {
      const newGroup = await window.storageApi.addCommandGroup(groupData)

      if (groupForm.value.copyFromGroupId) {
        const sourceCommands = presetCommands.value.filter(
          (cmd) => cmd.groupId === groupForm.value.copyFromGroupId
        )

        if (sourceCommands.length > 0) {
          const newCommands = sourceCommands.map((cmd) => ({
            ...cmd,
            id: undefined,
            groupId: newGroup.groupId
          }))

          for (const cmd of newCommands) {
            await window.storageApi.addPresetCommand(cmd)
          }

          ElMessage.success(`命令组已添加，并复制了 ${newCommands.length} 条命令`)
        } else {
          ElMessage.success('命令组已添加')
        }
      } else {
        ElMessage.success('命令组已添加')
      }

      // 自动选中新创建的组
      selectedGroupId.value = newGroup.groupId
      selectedGroupName.value = newGroup.name
      ElMessage.success('命令组已添加')
    }

    loadGroups()
    loadPresetCommands()
    isGroupDialogOpen.value = false
  } catch (error) {
    console.error('保存命令组失败:', error)
    ElMessage.error('保存命令组失败')
  }
}

// 打开新增命令对话框
const openAddPresetDialog = () => {
  isEditing.value = false
  currentEditingCmd.value = null
  presetForm.value = {
    name: '',
    command: '',
    delay: 0,
    groupId: selectedGroupId.value
  }
  isPresetDialogOpen.value = true
  focusInput()
}

const editPresetCommand = (cmd: any) => {
  contextMenuVisible.value = false
  isEditing.value = true
  currentEditingCmd.value = cmd
  presetForm.value = {
    name: cmd.name,
    command: cmd.command,
    delay: cmd.delay,
    groupId: cmd.groupId
  }
  isPresetDialogOpen.value = true
  focusInput()
}

const savePresetCommand = async () => {
  if (!presetFormRef.value) return

  try {
    await presetFormRef.value.validate()

    const pureFormData = {
      name: presetForm.value.name.trim(),
      command: presetForm.value.command.trim(),
      delay: Number(presetForm.value.delay) || 0,
      groupId: selectedGroupId.value
    }

    if (isEditing.value && currentEditingCmd.value) {
      const updatedCmd = {
        id: currentEditingCmd.value.id,
        ...pureFormData
      }
      await window.storageApi.updatePresetCommand(JSON.parse(JSON.stringify(updatedCmd)))
      ElMessage.success('命令已更新')
    } else {
      await window.storageApi.addPresetCommand(JSON.parse(JSON.stringify(pureFormData)))
      ElMessage.success('命令已添加')
    }

    loadPresetCommands()
    isPresetDialogOpen.value = false
  } catch (error) {
    console.error('保存命令失败:', error)
    ElMessage.error('保存失败：' + (error as Error).message)
  }
}

const deletePresetCommand = async (id: number) => {
  contextMenuVisible.value = false
  try {
    await window.storageApi.deletePresetCommand(id)
    ElMessage.success('命令已删除')
    loadPresetCommands()
  } catch (error) {
    console.error('删除命令失败:', error)
    ElMessage.error('删除命令失败')
  }
}

const showContextMenu = (cmd: any, event: MouseEvent) => {
  event.preventDefault()
  event.stopPropagation()

  currentEditingCmd.value = cmd

  const menuHeight = 124
  const screenHeight = window.innerHeight

  let left = event.clientX
  let top = event.clientY

  if (top + menuHeight > screenHeight) {
    top = screenHeight - menuHeight - 10
  }

  if (left + 120 > window.innerWidth) {
    left = window.innerWidth - 120 - 10
  }

  contextMenuLeft.value = left
  contextMenuTop.value = top
  contextMenuVisible.value = true
}

const closeContextMenuOnClickOutside = (event: MouseEvent) => {
  const contextMenu = document.querySelector('.context-menu')
  if (contextMenu && !contextMenu.contains(event.target as Node)) {
    contextMenuVisible.value = false
  }
}

const sendPresetCommand = async (cmd: any) => {
  if (!props.isConnected) return

  try {
    emit('commandSent', cmd.name.trim())
    emit('commandSentContent', cmd.command)
    window.connectApi.sendData({
      conn: getCurrentConnect(),
      command: cmd.command.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

const refreshGroupsCmds = () => {
  loadGroups()
  loadPresetCommands()
}

defineExpose({
  refreshGroupsCmds
})

watch(
  () => props.connection?.connectionType,
  () => {
    filterGroupsByConnectionType()
  }
)

watch(selectedGroupId, () => {
  filterCommandsByGroup()
})

// 组件生命周期
onMounted(() => {
  loadGroups()
  loadPresetCommands()
  document.addEventListener('click', closeContextMenuOnClickOutside)
  document.addEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenuOnClickOutside)
  document.removeEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })

  Object.values(loopIntervals.value).forEach((interval) => {
    clearInterval(interval)
  })
})
</script>

<style scoped>
.preset-commands {
  padding: 8px 15px;
  border-bottom: 1px solid #333;
  background: #252526;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
  max-height: 100px;
  overflow-y: auto;
}

.preset-commands::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

.preset-commands::-webkit-scrollbar-thumb {
  background-color: #444;
  border-radius: 3px;
}

.el-drop-down {
  background-color: transparent;
  border: none;
}

.el-dropdown-menu {
  background-color: #2d2d2d !important; /* 深色背景 */
  border: 1px solid #444 !important; /* 边框 */
  border-radius: 6px !important; /* 圆角 */
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important; /* 阴影 */
  padding: 4px 0 !important; /* 上下内边距 */
  min-width: 200px !important; /* 最小宽度 */
  margin: 0px;
}

.group-selector {
  background-color: #3a3a3a !important;
  border: 2px solid transparent !important;
  color: #fff !important;
}

.group-selector:hover {
  border: 2px solid #007acc !important;
}

.group-actions {
  display: flex;
  gap: 8px;
  margin-left: 10px;
}

.action-icon {
  cursor: pointer;
  transition: color 0.2s;
}

.add-icon {
  color: #42b983;
}

.edit-icon {
  color: #fff;
}

.delete-icon {
  color: #ff4d4f;
}

.menu-divider {
  height: 1px;
  background-color: #444;
  margin: 4px 0;
  width: 100%;
}

.add-preset-btn {
  background-color: #1A97ED !important;
  border-color: #1A97ED !important;
  color: white !important;
  width: 90px !important;
}

.add-preset-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.add-preset-btn:disabled {
  background-color: #444 !important;
  border-color: #555 !important;
  cursor: not-allowed;
}

.preset-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
  margin: 2px 0 !important;
  transition: all 0.2s ease !important;
  position: relative !important;
  z-index: 1 !important;
}

.preset-btn:hover {
  background-color: #4a4a4a !important;
  border-color: #555 !important;
  transform: translateY(-1px);
}

.preset-btn.looping {
  animation: pulse 1.5s infinite;
  border-color: #165dff !important;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(22, 93, 255, 0.4);
  }
  70% {
    box-shadow: 0 0 0 8px rgba(22, 93, 255, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(22, 93, 255, 0);
  }
}

.context-menu-container {
  position: fixed !important;
  z-index: 9999 !important;
  padding: 2px !important;
  background-color: #2d2d2d !important;
  border-radius: 4px !important;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.5) !important;
  border: 1px solid #444 !important;
  transition: opacity 0.1s ease;
}

.context-menu {
  width: 120px !important;
  background-color: transparent !important;
  border: none !important;
}

.menu-item {
  color: #e0e0e0 !important;
  height: 36px !important;
  line-height: 36px !important;
  padding: 0 16px !important;
  margin: 0 !important;
  border-radius: 2px !important;
  transition: background-color 0.15s ease !important;
}

.menu-item:hover {
  background-color: #3a3a3a !important;
}

.delete-item {
  color: #ff4d4f !important;
}

.el-menu--vertical {
  border-right: none !important;
}

.el-menu-item:not(:last-child) {
  border-bottom: 1px solid #383838 !important;
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
  width: 100px;
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

.custom-textarea,
.el-textarea__inner {
  background-color: transparent;
  max-height: 200px;
}

.custom-dropdown-menu {
  background-color: #2d2d2d !important;
  border: 1px solid #444 !important;
  border-radius: 6px !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6) !important;
  padding: 8px 0 !important;
  min-width: 240px !important;
  overflow: hidden;
}

:deep(.group-menu-item) {
  display: flex !important;
  align-items: center !important;
  padding: 8px 16px !important;
  color: #fff !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  height: auto !important;
  line-height: normal !important;
}

:deep(.group-menu-item:hover) {
  background-color: #0078d4 !important;
}

.new-group-item {
  color: #42b983 !important;
  font-weight: 500 !important;
}

:deep(.active-group) {
  background-color: rgba(22, 93, 255, 0.15) !important;
  border-left: 3px solid #165dff !important;
}

.group-name,
.group-name-new {
  flex: 1 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  margin-right: 8px !important;
  color: #fff;
}

.group-type-badge {
  font-size: 12px !important;
  padding: 2px 6px !important;
  border-radius: 3px !important;
  margin-right: 8px !important;
  background-color: #444 !important;
  color: #fff !important;
}

.group-type-badge:empty {
  display: none !important;
}

.menu-divider-item {
  padding: 0 !important;
  margin: 4px 0 !important;
}

.menu-divider {
  height: 1px !important;
  background-color: #444 !important;
  margin: 0 8px !important;
}

.group-selector {
  background-color: #3a3a3a !important;
  border: 2px solid transparent !important;
  color: #fff !important;
  padding: 6px 12px !important;
  display: inline-flex !important;
  align-items: center !important;
  gap: 6px !important;
}

.group-selector:hover {
  border: 2px solid #0078d4 !important;
}

.group-selector-text {
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  max-width: 180px !important;
}

.action-icon {
  transition: all 0.2s ease !important;
  opacity: 0.8 !important;
}

.action-icon:hover {
  transform: scale(1.1) !important;
  opacity: 1 !important;
}

.edit-icon:hover {
  color: #fff !important;
}

.delete-icon:hover {
  color: #ff6b6b !important;
}

.form-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #888;
  line-height: 1.4;
}
</style>
