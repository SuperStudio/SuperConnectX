<template>
  <div class="preset-commands">
    <!-- 编辑命令按钮 -->
    <el-button class="btn-primary edit-commands-btn" size="small" @click="openCommandEditor">
      <el-icon><Edit /></el-icon>
      {{ t('presetCommands.editCommands') }}
    </el-button>

    <!-- 运行/停止按钮（移到组选择左边） -->
    <div class="group-actions-buttons">
      <el-tooltip :content="isRunningAll ? t('presetCommands.stopLoopRunning') : t('presetCommands.loopRunning')" placement="bottom" effect="dark" :enterable="false">
        <el-button
          size="small"
          :class="isRunningAll ? 'run-btn stop-btn' : 'run-btn'"
          :disabled="!selectedGroupId || filteredCommands.length === 0"
          @click="toggleRunAllCommands"
        >
          <svg v-if="!isRunningAll" class="play-icon" viewBox="0 0 16 16" width="16" height="16">
            <path d="M4.5 2.5 L12.5 7.5 L4.5 12.5 Z" fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"/>
          </svg>
          <span v-else class="stop-icon"></span>
        </el-button>
      </el-tooltip>
    </div>

    <!-- 组选择下拉框 -->
    <el-dropdown
      class="el-drop-down"
      v-model="selectedGroupId"
      @command="handleGroupCommand"
      placement="bottom-start"
      popper-class="group-dropdown-popper"
      trigger="click"
    >
      <el-button type="default" size="small" class="group-selector">
        <span class="group-selector-text">{{ selectedGroupName || t('presetCommands.noGroup') }}</span>
        <el-icon class="el-icon--right"> <ArrowDown /></el-icon>
      </el-button>
      <template #dropdown>
        <el-dropdown-menu class="dropdown-menu">
          <!-- 新建组选项 -->
          <el-dropdown-item command="new" class="group-menu-item new-group-item">
            <el-icon size="16" class="action-icon add-icon"><Plus /></el-icon>
            <span class="group-name-new">{{ t('presetCommands.newGroup') }}</span>
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
      icon="Plus"
      size="small"
      @click="openAddPresetDialog"
      :disabled="!selectedGroupId"
      class="btn-primary add-preset-btn"
    >
      {{ t('presetCommands.addCommand') }}
    </el-button>

    <!-- 命令按钮列表 -->
    <el-tooltip
      v-for="cmd in filteredCommands"
      :key="cmd.id"
      :content="cmd.command"
      placement="top"
      effect="dark"
      :hide-after="0"
      :enterable="false"
    >
      <el-button
        type="default"
        size="small"
        class="preset-btn"
        :class="{ looping: loopStatus[cmd.id] }"
        @click="sendPresetCommand(cmd)"
        @contextmenu.prevent="showContextMenu(cmd, $event)"
      >
        {{ cmd.name }}
        <template v-if="loopStatus[cmd.id]">🔄</template>
      </el-button>
    </el-tooltip>

    <!-- 组编辑对话框 -->
    <el-dialog
      :title="isEditingGroup ? t('presetCommands.editGroup') : t('presetCommands.newGroup')"
      v-model="isGroupDialogOpen"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form :model="groupForm" :rules="groupRules" ref="groupFormRef" label-width="120px" @submit.prevent @keydown.enter="saveGroup">
        <el-form-item :label="t('presetCommands.groupName')" prop="name">
          <el-input v-model="groupForm.name" :placeholder="t('presetCommands.groupNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('presetCommands.connectionType')" prop="connectionType">
          <el-select v-model="groupForm.connectionType" :placeholder="t('presetCommands.selectConnectionType')">
            <el-option label="Telnet" value="telnet" />
            <el-option label="SSH" value="ssh" disabled />
            <el-option label="FTP" value="ftp" />
          </el-select>
        </el-form-item>

        <el-form-item :label="t('presetCommands.copyGroup')" v-if="!isEditingGroup">
          <el-select v-model="groupForm.copyFromGroupId" placeholder="（可选）" clearable>
            <el-option
              v-for="group in copyableGroups"
              :key="group.groupId"
              :label="group.name"
              :value="group.groupId"
            />
          </el-select>
          <div class="form-hint">{{ t('presetCommands.copyGroupHint') }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-cancel" style="width: auto !important" @click="isGroupDialogOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button class="btn-primary" style="width: auto !important" @click="saveGroup">{{ t('presetCommands.save') }}</el-button>
      </template>
    </el-dialog>

    <!-- 命令编辑对话框 -->
    <el-dialog
      :title="isEditing ? t('presetCommands.editCommand') : t('presetCommands.addCommand')"
      v-model="isPresetDialogOpen"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form :model="presetForm" :rules="presetRules" ref="presetFormRef" label-width="120px" @submit.prevent @keydown.enter="savePresetCommand">
        <el-form-item :label="t('presetCommands.commandName')" prop="name">
          <el-input v-model="presetForm.name" :placeholder="t('presetCommands.commandNamePlaceholder')" ref="nameInputRef" />
        </el-form-item>
        <el-form-item :label="t('presetCommands.commandContent')" prop="command">
          <el-input
            v-model="presetForm.command"
            type="textarea"
            :placeholder="t('presetCommands.commandContentPlaceholder')"
            :rows="4"
            class="custom-textarea"
          />
        </el-form-item>
        <el-form-item :label="t('presetCommands.loopDelay')" prop="delay">
          <el-input
            v-model.number="presetForm.delay"
            type="number"
            :placeholder="t('presetCommands.loopDelayPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('presetCommands.seqNum')" prop="seqNum">
          <el-input-number
            v-model="presetForm.seqNum"
            :min="1"
            :max="999"
            :placeholder="t('presetCommands.seqNumPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-cancel" style="width: auto !important" @click="isPresetDialogOpen = false">{{ t('common.cancel') }}</el-button>
        <el-button class="btn-primary" style="width: auto !important" @click="savePresetCommand">{{ t('presetCommands.save') }}</el-button>
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
          {{ t('common.edit') }}
        </el-menu-item>
        <el-menu-item
          class="menu-item delete-item"
          @click="deletePresetCommand(currentEditingCmd.id)"
        >
          {{ t('common.delete') }}
        </el-menu-item>

        <el-menu-item class="menu-item" @click="toggleLoopSend(currentEditingCmd)">
          {{ loopStatus[currentEditingCmd.id] ? t('presetCommands.stopLoop') : t('presetCommands.loopSend') }}
        </el-menu-item>
      </el-menu>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElForm, ElInput, ElMessageBox } from 'element-plus'

const { t } = useI18n()
import { ElSelect, ElDropdown, ElDropdownMenu, ElDropdownItem, ElIcon } from 'element-plus'
import { Plus, Edit, Delete, ArrowDown } from '@element-plus/icons-vue'
import FormUtils from '../utils/FormUtils'
import eventBus from '../utils/EventBus'

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

// 循环运行所有命令相关
const isRunningAll = ref(false)
const runAllInterval = ref<NodeJS.Timeout | null>(null)
const runAllCommandIndex = ref(0)
const presetRules = FormUtils.buildPresetCmd()
const presetFormRef = ref<InstanceType<typeof ElForm> | null>(null)
const nameInputRef = ref<InstanceType<typeof ElInput> | null>(null)
const presetForm = ref<{
  name: string
  command: string
  delay: number
  seqNum: number
  groupId: number | null
}>({
  name: '',
  command: '',
  delay: 0,
  seqNum: 1,
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
    comName?: string
    sessionId: string
  }
}>()

// 定义事件
const emit = defineEmits<{
  (e: 'commandSent', cmdName: string): void
  (e: 'commandSentContent', content: string): void
  (e: 'openCommandEditor', connectionType: string): void
}>()

// 打开命令编辑器
const openCommandEditor = () => {
  const connType = props.connection?.connectionType || 'telnet'
  emit('openCommandEditor', connType)
}

// 获取当前连接的协议类型（用于存储 key）
// COM 协议的命令组实际使用 telnet 类型，所以存储 key 也统一为 telnet
const getStorageConnType = (): string => {
  const connType = props.connection?.connectionType || 'telnet'
  return connType === 'com' ? 'telnet' : connType
}

// 辅助函数：从 AppSettings 中获取按协议存储的值，兼容旧格式
const getProtocolValue = (settings: any, key: string): number | null | undefined => {
  const val = settings?.[key]
  if (val == null) return undefined
  // 新格式：Record<string, number | null>
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val[getStorageConnType()] ?? undefined
  }
  // 旧格式兼容：直接是 number 值
  if (typeof val === 'number') {
    return val
  }
  return undefined
}

// 辅助函数：构建按协议存储的 map 并保存
const saveProtocolValue = async (key: string, value: number | null) => {
  try {
    const currentSettings = await window.storageApi.getAppSettings()
    const map = (currentSettings?.[key] && typeof currentSettings[key] === 'object' && !Array.isArray(currentSettings[key]))
      ? { ...currentSettings[key] }
      : {}
    map[getStorageConnType()] = value
    await window.storageApi.saveAppSettings({
      ...currentSettings,
      [key]: map
    })
  } catch {
    // ignore
  }
}

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
    ElMessage.success(t('presetCommands.stopLoopMessage', { name: cmd.name }))
    return
  }

  loopStatus.value[cmd.id] = true
  sendPresetCommand(cmd)
  const intervalTime = Math.max(cmd.delay, 100)
  loopIntervals.value[cmd.id] = setInterval(() => {
    sendPresetCommand(cmd)
  }, intervalTime)

  ElMessage.success(t('presetCommands.startLoopMessage', { name: cmd.name, interval: intervalTime }))
}

// 循环运行所有命令
const toggleRunAllCommands = () => {
  if (isRunningAll.value) {
    // 停止
    if (runAllInterval.value) {
      clearInterval(runAllInterval.value)
      runAllInterval.value = null
    }
    isRunningAll.value = false
    runAllCommandIndex.value = 0
  } else {
    // 开始运行
    if (filteredCommands.value.length === 0) {
      ElMessage.warning(t('presetCommands.noCommandsInGroup'))
      return
    }
    isRunningAll.value = true
    runAllCommandIndex.value = 0
    runNextCommand()
  }
}

const runNextCommand = () => {
  if (!isRunningAll.value || filteredCommands.value.length === 0) {
    return
  }

  const cmd = filteredCommands.value[runAllCommandIndex.value]
  sendPresetCommand(cmd)

  // 更新下一个命令索引
  runAllCommandIndex.value = (runAllCommandIndex.value + 1) % filteredCommands.value.length

  // 获取当前命令的延时，作为下一个命令的间隔
  const delay = Math.max(cmd.delay, 100)

  // 设置定时器运行下一个命令
  runAllInterval.value = setTimeout(() => {
    if (isRunningAll.value) {
      runNextCommand()
    }
  }, delay)
}

// 加载组数据
const loadGroups = async () => {
  try {
    const savedGroups = await window.storageApi.getCommandGroups()
    groups.value = Array.isArray(savedGroups) ? savedGroups : []
    filterGroupsByConnectionType()

    // 尝试恢复上次选中的分组（按协议类型）
    let restored = false
    try {
      const appSettings = await window.storageApi.getAppSettings()
      const savedId = getProtocolValue(appSettings, 'commandEditorSelectedGroupId')
      if (savedId != null && filteredGroups.value.some(g => g.groupId === savedId)) {
        selectedGroupId.value = savedId
        const selected = groups.value.find((g) => g.groupId === selectedGroupId.value)
        if (selected) {
          selectedGroupName.value = selected.name
        }
        restored = true
        filterCommandsByGroup()
      }
    } catch {
      // ignore
    }
    // 如果没有恢复成功，选中第一个分组
    if (!restored && filteredGroups.value.length > 0 && !selectedGroupId.value) {
      const firstGroup = filteredGroups.value[0]
      selectedGroupId.value = firstGroup.groupId
      selectedGroupName.value = firstGroup.name
      filterCommandsByGroup() // 同步加载该组的命令
    }
  } catch (error) {
    console.error('Failed to load command groups:', error)
    ElMessage.error(t('presetCommands.groupLoadFailed'))
  }
}

const getCurrentConnect = () => {
  const conn: any = {
    id: props.connection?.id,
    name: props.connection?.name,
    connectionType: props.connection?.connectionType,
    sessionId: props.connection?.sessionId
  }
  if (props.connection?.connectionType === 'com') {
    conn.comName = props.connection.comName
    conn.encoding = 'utf8'
  } else {
    conn.host = props.connection?.host
    conn.port = props.connection?.port
  }
  return conn
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
    console.error('Failed to load preset commands:', error)
    ElMessage.error(t('presetCommands.commandLoadFailed'))
  }
}

// 根据选中的组过滤命令
const filterCommandsByGroup = () => {
  filteredCommands.value = selectedGroupId.value
    ? presetCommands.value
        .filter((cmd) => cmd.groupId === selectedGroupId.value)
        .sort((a, b) => (a.seqNum ?? 999) - (b.seqNum ?? 999))
    : []
}

// 处理组选择
const handleGroupCommand = async (command: string | number) => {
  if (command === 'new') {
    openAddGroupDialog()
    return
  }

  selectedGroupId.value = Number(command)
  const selected = groups.value.find((g) => g.groupId === selectedGroupId.value)
  if (selected) {
    selectedGroupName.value = selected.name
  }
  // 保存选中的分组到 AppSettings（按协议类型）
  saveProtocolValue('commandEditorSelectedGroupId', selectedGroupId.value)
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
    await ElMessageBox.confirm(t('presetCommands.deleteGroupConfirm', { name: group.name }), t('presetCommands.deleteGroupTitle'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      center: true,
      cancelButtonClass: 'el-button--danger'
    })

    await window.storageApi.deleteCommandGroup(group.groupId)
    // 删除组关联的命令
    await Promise.all(
      presetCommands.value
        .filter((cmd) => cmd.groupId === group.groupId)
        .map((cmd) => window.storageApi.deletePresetCommand(cmd.id))
    )

    ElMessage.success(t('presetCommands.groupDeleted'))
    loadGroups()
    loadPresetCommands()

    // 如果删除的是当前选中的组，清除选中状态
    if (selectedGroupId.value === group.groupId) {
      selectedGroupId.value = null
      selectedGroupName.value = ''
    }
  } catch (error) {
    console.error('Failed to delete command group:', error)
    ElMessage.error(t('presetCommands.groupDeleteFailed'))
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
let isSavingGroup = false

const saveGroup = async () => {
  if (!groupFormRef.value || isSavingGroup) return
  isSavingGroup = true

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
      ElMessage.success(t('presetCommands.groupUpdated'))
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

          ElMessage.success(t('presetCommands.groupAddedWithCopy', { n: newCommands.length }))
        } else {
          ElMessage.success(t('presetCommands.groupAdded'))
        }
      } else {
        ElMessage.success(t('presetCommands.groupAdded'))
      }

      // 自动选中新创建的组
      selectedGroupId.value = newGroup.groupId
      selectedGroupName.value = newGroup.name
    }

    loadGroups()
    loadPresetCommands()
    isGroupDialogOpen.value = false
  } catch (error) {
    console.error('Failed to save command group:', error)
    ElMessage.error(t('presetCommands.groupSaveFailed'))
  } finally {
    isSavingGroup = false
  }
}

// 打开新增命令对话框
const openAddPresetDialog = () => {
  isEditing.value = false
  currentEditingCmd.value = null
  // 默认序号为当前组内命令数量 + 1
  const currentCmdCount = presetCommands.value.filter(
    (cmd) => cmd.groupId === selectedGroupId.value
  ).length
  presetForm.value = {
    name: '',
    command: '',
    delay: 0,
    seqNum: currentCmdCount + 1,
    groupId: selectedGroupId.value
  }
  isPresetDialogOpen.value = true
  focusInput()
}

const editPresetCommand = (cmd: any) => {
  contextMenuVisible.value = false
  isEditing.value = true
  currentEditingCmd.value = cmd
  console.log('Edit command seqNum:', cmd.seqNum, 'type:', typeof cmd.seqNum)
  presetForm.value.name = cmd.name
  presetForm.value.command = cmd.command
  presetForm.value.delay = cmd.delay ?? 0
  presetForm.value.seqNum = Number(cmd.seqNum) || 1
  presetForm.value.groupId = cmd.groupId
  isPresetDialogOpen.value = true
  nextTick(() => {
    focusInput()
  })
}

const savePresetCommand = async () => {
  if (!presetFormRef.value) return

  try {
    await presetFormRef.value.validate()

    console.log('Save command - presetForm:', presetForm.value)
    console.log('Save command - seqNum value:', presetForm.value.seqNum, 'type:', typeof presetForm.value.seqNum)

    const pureFormData = {
      name: presetForm.value.name.trim(),
      command: presetForm.value.command.trim(),
      delay: Number(presetForm.value.delay) || 0,
      seqNum: Number(presetForm.value.seqNum) || 1,
      groupId: selectedGroupId.value
    }

    console.log('Save command - pureFormData:', pureFormData)

    if (isEditing.value && currentEditingCmd.value) {
      const updatedCmd = {
        id: currentEditingCmd.value.id,
        ...pureFormData
      }
      console.log('Update command - updatedCmd:', updatedCmd)
      await window.storageApi.updatePresetCommand(JSON.parse(JSON.stringify(updatedCmd)))
      ElMessage.success(t('presetCommands.commandUpdated'))
    } else {
      console.log('Add command - pureFormData:', pureFormData)
      await window.storageApi.addPresetCommand(JSON.parse(JSON.stringify(pureFormData)))
      ElMessage.success(t('presetCommands.commandAdded'))
    }

    loadPresetCommands()
    isPresetDialogOpen.value = false
  } catch (error) {
    console.error('Failed to save command:', error)
    ElMessage.error(t('presetCommands.commandSaveFailed') + '：' + (error as Error).message)
  }
}

const deletePresetCommand = async (id: number) => {
  contextMenuVisible.value = false
  try {
    await window.storageApi.deletePresetCommand(id)
    ElMessage.success(t('presetCommands.commandDeleted'))
    loadPresetCommands()
  } catch (error) {
    console.error('Failed to delete command:', error)
    ElMessage.error(t('presetCommands.commandDeleteFailed'))
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
  if (!props.isConnected) {
    ElMessage.warning(t('terminal.notConnected'))
    return
  }

  try {
    emit('commandSent', cmd.name.trim())
    emit('commandSentContent', cmd.command)
    const conn = getCurrentConnect()
    console.log('Send command - connection info:', JSON.stringify(conn), 'command:', cmd.command.trim())
    const result = await window.connectApi.sendData({
      conn: conn,
      command: cmd.command.trim()
    })
    console.log('Send result:', JSON.stringify(result))
    if (!result.success) {
      ElMessage.error(result.message || t('terminal.commandSendFailed'))
    }
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('Failed to send:', error)
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
  async () => {
    filterGroupsByConnectionType()
    // 协议类型变化时，尝试恢复该协议上次选中的分组
    let restored = false
    try {
      const appSettings = await window.storageApi.getAppSettings()
      const savedId = getProtocolValue(appSettings, 'commandEditorSelectedGroupId')
      if (savedId != null && filteredGroups.value.some(g => g.groupId === savedId)) {
        selectedGroupId.value = savedId
        const selected = groups.value.find((g) => g.groupId === selectedGroupId.value)
        if (selected) {
          selectedGroupName.value = selected.name
        }
        restored = true
        filterCommandsByGroup()
      }
    } catch {
      // ignore
    }
    // 如果没有恢复成功，选中第一个分组
    if (!restored && filteredGroups.value.length > 0 && !selectedGroupId.value) {
      const firstGroup = filteredGroups.value[0]
      selectedGroupId.value = firstGroup.groupId
      selectedGroupName.value = firstGroup.name
      filterCommandsByGroup()
    }
  }
)

watch(selectedGroupId, () => {
  filterCommandsByGroup()
})

// 监听连接状态，断开时停止所有循环发送
watch(
  () => props.isConnected,
  (connected) => {
    if (!connected) {
      stopAllLoopSend()
    }
  }
)

// 停止所有循环发送
const stopAllLoopSend = () => {
  // 停止单个命令的循环发送
  Object.keys(loopIntervals.value).forEach((cmdId) => {
    if (loopIntervals.value[Number(cmdId)]) {
      clearInterval(loopIntervals.value[Number(cmdId)])
    }
  })
  loopIntervals.value = {}
  loopStatus.value = {}

  // 停止运行所有命令
  if (runAllInterval.value) {
    clearTimeout(runAllInterval.value)
    runAllInterval.value = null
  }
  isRunningAll.value = false
  runAllCommandIndex.value = 0
}

// 组件生命周期
onMounted(() => {
  loadGroups()
  loadPresetCommands()
  document.addEventListener('click', closeContextMenuOnClickOutside)
  document.addEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
  // 监听命令组变化事件
  eventBus.on('commandGroupsChanged', handleCommandGroupsChanged)
  // 监听预设命令变化事件
  eventBus.on('presetCommandsChanged', handlePresetCommandsChanged)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeContextMenuOnClickOutside)
  document.removeEventListener('contextmenu', () => {
    contextMenuVisible.value = false
  })
  // 移除命令组变化事件监听
  eventBus.off('commandGroupsChanged', handleCommandGroupsChanged)
  // 移除预设命令变化事件监听
  eventBus.off('presetCommandsChanged', handlePresetCommandsChanged)

  Object.values(loopIntervals.value).forEach((interval) => {
    clearInterval(interval)
  })
  if (runAllInterval.value) {
    clearTimeout(runAllInterval.value)
    runAllInterval.value = null
  }
  isRunningAll.value = false
})

// 处理命令组变化事件
const handleCommandGroupsChanged = (connectionType: string) => {
  // 只刷新当前协议类型的分组
  if (props.connection?.connectionType === connectionType) {
    const prevSelectedId = selectedGroupId.value
    loadGroups().then(() => {
      // 如果之前有选中的组，刷新后同步组名称
      if (prevSelectedId) {
        const updatedGroup = groups.value.find((g) => g.groupId === prevSelectedId)
        if (updatedGroup) {
          selectedGroupName.value = updatedGroup.name
        }
      }
    })
  }
}

// 处理预设命令变化事件
const handlePresetCommandsChanged = (connectionType: string) => {
  // 只刷新当前协议类型的命令
  if (props.connection?.connectionType === connectionType) {
    loadPresetCommands()
  }
}
</script>

<style scoped>
.preset-commands {
  padding: 8px 15px 8px 5px;
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

.edit-commands-btn {
  width: 90px !important;
  height: 24px !important;
  flex-shrink: 0;
  padding: 5px 11px !important;
}

.edit-commands-btn :deep(.el-icon) {
  margin-right: 4px;
}

.edit-commands-btn:hover {
  transform: translateY(-1px);
}

.el-drop-down {
  background-color: transparent;
  border: none;
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

.group-actions {
  display: flex;
  gap: 8px;
  margin-left: 10px;
}

.action-icon {
  cursor: pointer;
  transition: all 0.2s ease !important;
  opacity: 0.8 !important;
}

.action-icon:hover {
  transform: scale(1.1) !important;
  opacity: 1 !important;
}

.add-icon {
  color: #42b983;
}

.edit-icon:hover {
  color: #fff !important;
}

.delete-icon {
  color: #ff4d4f;
}

.delete-icon:hover {
  color: #ff6b6b !important;
}

.add-preset-btn {
  width: 90px !important;
}

.add-preset-btn:hover {
  transform: translateY(-1px);
}

.add-preset-btn:disabled {
  cursor: not-allowed;
}

.group-actions-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 4px;
}

/* 运行按钮：去掉背景，绿色三角 */
.run-btn {
  background-color: transparent !important;
  border-color: transparent !important;
  color: #99E699 !important;
  box-shadow: none !important;
  width: 28px !important;
  height: 28px !important;
}

.run-btn:hover:not(:disabled) {
  background-color: rgba(153, 230, 153, 0.15) !important;
  color: #99E699 !important;
}

.run-btn:disabled {
  color: #555 !important;
}

/* 运行按钮的圆角三角形图标 */
.play-icon {
  display: inline-block;
  vertical-align: middle;
}

/* 运行按钮的图标更大 */
.run-btn:not(.stop-btn) :deep(.el-icon) {
  font-size: 16px;
}

/* 停止按钮：无背景，红色正方形图标 */
.run-btn.stop-btn {
  background-color: transparent !important;
  border-color: transparent !important;
  color: #c45656 !important;
  box-shadow: none !important;
}

.run-btn.stop-btn:hover:not(:disabled) {
  background-color: rgba(196, 86, 86, 0.15) !important;
  color: #c45656 !important;
}

/* 正方形图标 */
.stop-icon {
  display: inline-block;
  width: 10px;
  height: 10px;
  background-color: #c45656;
  border-radius: 2px;
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

/* 右键上下文菜单容器 */
.context-menu-container {
  position: fixed;
  z-index: 9999;
  padding: 0;
}

/* 右键菜单 —— 使用 main.css 的 .context-menu 统一样式 */
.context-menu-container .context-menu {
  width: 120px !important;
}

.context-menu-container :deep(.el-menu) {
  background-color: var(--menu-bg-color);
  border: 1px solid var(--menu-border-color);
  border-radius: var(--menu-border-radius);
  box-shadow: var(--menu-box-shadow);
  padding: 4px 0;
}

.context-menu-container :deep(.el-menu--vertical) {
  border-right: none !important;
}

.context-menu-container :deep(.el-menu-item) {
  color: var(--menu-item-color) !important;
  font-size: var(--menu-item-font-size);
  height: 36px !important;
  line-height: 36px !important;
  padding: var(--menu-item-padding);
  margin: 0 !important;
  white-space: nowrap;
  transition: background-color 0.15s ease, color 0.15s ease;
}

.context-menu-container :deep(.el-menu-item:hover) {
  background-color: var(--menu-item-hover-bg) !important;
  color: var(--menu-item-hover-color) !important;
}

.context-menu-container :deep(.el-menu-item:not(:last-child)) {
  border-bottom: 1px solid var(--menu-divider-color) !important;
}

.context-menu-container :deep(.delete-item) {
  color: var(--menu-danger-color) !important;
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
  --el-border-color: var(--focus-border-color) !important;
}

:deep(.custom-textarea .el-textarea__inner),
:deep(.el-textarea__inner) {
  background: #3a3a3a;
  box-shadow: 0 0 0 1px #444 inset;
  color: #e0e0e0;
  resize: vertical;
  max-height: 200px;
}

:deep(.custom-textarea .el-textarea__inner:hover),
:deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

:deep(.custom-textarea .el-textarea__inner:focus),
:deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

/* 下拉菜单样式 - 扩展最小宽度 */
.dropdown-menu {
  min-width: 240px !important;
}

/* popper 容器限制高度并启用滚动 */
:global(.group-dropdown-popper) {
  max-height: 50vh !important;
  overflow: hidden !important;
}

:global(.group-dropdown-popper .el-scrollbar) {
  max-height: 50vh !important;
  overflow-y: auto !important;
}

:global(.group-dropdown-popper .el-scrollbar::-webkit-scrollbar) {
  width: 5px;
}

:global(.group-dropdown-popper .el-scrollbar::-webkit-scrollbar-track) {
  background: transparent;
}

:global(.group-dropdown-popper .el-scrollbar::-webkit-scrollbar-thumb) {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 3px;
}

:global(.group-dropdown-popper .el-scrollbar::-webkit-scrollbar-thumb:hover) {
  background: rgba(255, 255, 255, 0.3);
}

/* 组菜单项样式 */
:deep(.group-menu-item) {
  display: flex !important;
  align-items: center !important;
  padding: 8px 16px !important;
  color: var(--menu-item-color) !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
  height: auto !important;
  line-height: normal !important;
}

:deep(.group-menu-item:hover) {
  background-color: var(--menu-item-hover-bg) !important;
  color: var(--menu-item-hover-color) !important;
}

.new-group-item {
  color: var(--menu-item-hover-color) !important;
  font-weight: 500 !important;
}

:deep(.active-group) {
  background-color: rgba(22, 93, 255, 0.15) !important;
  border-left: 3px solid var(--focus-border-color) !important;
}

.group-name,
.group-name-new {
  flex: 1 !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
  margin-right: 8px !important;
  color: var(--menu-item-hover-color);
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

.form-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #888;
  line-height: 1.4;
}
</style>
