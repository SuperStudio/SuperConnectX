<template>
  <div class="preset-commands">
    <!-- 编辑命令按钮 -->
    <el-button type="default" size="small" class="edit-commands-btn" @click="openCommandEditor">
      <el-icon><Edit /></el-icon>
      编辑命令
    </el-button>

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

    <!-- 运行/停止按钮 -->
    <div class="group-actions-buttons">
      <el-tooltip :content="isRunningAll ? '停止循环' : '循环运行'" placement="bottom">
        <el-button
          :type="isRunningAll ? 'danger' : 'default'"
          size="small"
          circle
          :disabled="!selectedGroupId || filteredCommands.length === 0"
          @click="toggleRunAllCommands"
        >
          <el-icon v-if="!isRunningAll"><VideoPlay /></el-icon>
          <el-icon v-else><VideoPause /></el-icon>
        </el-button>
      </el-tooltip>
    </div>

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
            class="custom-textarea"
          />
        </el-form-item>
        <el-form-item label="循环时延(ms)" prop="delay">
          <el-input
            v-model.number="presetForm.delay"
            type="number"
            placeholder="命令发送后等待时间"
          />
        </el-form-item>
        <el-form-item label="序号" prop="seqNum">
          <el-input-number
            v-model="presetForm.seqNum"
            :min="1"
            :max="999"
            placeholder="命令顺序"
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
import { Plus, Edit, Delete, ArrowDown, VideoPlay, VideoPause } from '@element-plus/icons-vue'
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
    ElMessage.success('已停止循环运行')
  } else {
    // 开始运行
    if (filteredCommands.value.length === 0) {
      ElMessage.warning('当前组没有命令')
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
    console.error('加载预设命令失败:', error)
    ElMessage.error('加载预设命令失败')
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
  console.log('编辑命令 seqNum:', cmd.seqNum, '类型:', typeof cmd.seqNum)
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

    console.log('保存命令 - presetForm:', presetForm.value)
    console.log('保存命令 - seqNum 值:', presetForm.value.seqNum, '类型:', typeof presetForm.value.seqNum)

    const pureFormData = {
      name: presetForm.value.name.trim(),
      command: presetForm.value.command.trim(),
      delay: Number(presetForm.value.delay) || 0,
      seqNum: Number(presetForm.value.seqNum) || 1,
      groupId: selectedGroupId.value
    }

    console.log('保存命令 - pureFormData:', pureFormData)

    if (isEditing.value && currentEditingCmd.value) {
      const updatedCmd = {
        id: currentEditingCmd.value.id,
        ...pureFormData
      }
      console.log('更新命令 - updatedCmd:', updatedCmd)
      await window.storageApi.updatePresetCommand(JSON.parse(JSON.stringify(updatedCmd)))
      ElMessage.success('命令已更新')
    } else {
      console.log('新增命令 - pureFormData:', pureFormData)
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
  if (!props.isConnected) {
    ElMessage.warning('请先建立连接')
    return
  }

  try {
    emit('commandSent', cmd.name.trim())
    emit('commandSentContent', cmd.command)
    const conn = getCurrentConnect()
    console.log('发送命令 - 连接信息:', JSON.stringify(conn), '命令:', cmd.command.trim())
    const result = await window.connectApi.sendData({
      conn: conn,
      command: cmd.command.trim()
    })
    console.log('发送结果:', JSON.stringify(result))
    if (!result.success) {
      ElMessage.error(result.message || '命令发送失败')
    }
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

.edit-commands-btn {
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
  flex-shrink: 0;
}

.edit-commands-btn:hover {
  background-color: #4a4a4a !important;
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

.group-actions-buttons {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
}

.group-actions-buttons .el-button {
  background-color: #3a3a3a;
  border-color: #444;
  color: #e0e0e0;
}

.group-actions-buttons .el-button:hover:not(:disabled) {
  background-color: #4a4a4a;
}

.group-actions-buttons .el-button--danger {
  background-color: #c45656 !important;
  border-color: #c45656 !important;
}

.group-actions-buttons .el-button--danger:hover:not(:disabled) {
  background-color: #d66a6a !important;
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
  box-shadow: 0 0 0 1px #1A97ED inset;
}

:deep(.custom-textarea .el-textarea__inner:focus),
:deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px #1A97ED inset;
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
