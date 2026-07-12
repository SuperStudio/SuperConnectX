<template>
  <div class="command-editor">
    <!-- 左边栏 -->
    <div class="sidebar">
      <!-- 添加组按钮 -->
      <div class="sidebar-header">
        <el-button class="btn-primary add-group-btn" @click="openGroupDialog">
          <el-icon><Plus /></el-icon>
          {{ t('commandEditor.newGroup') }}
        </el-button>
      </div>

      <!-- 搜索框 -->
      <div class="sidebar-search">
        <el-input v-model="searchKeyword" size="small" :placeholder="t('commandEditor.searchPlaceholder')" prefix-icon="Search" clearable />
      </div>

      <!-- 分组列表 -->
      <div class="sidebar-list">
        <div
          v-for="group in filteredGroups"
          :key="group.groupId"
          class="sidebar-item"
          :class="{ active: selectedGroupId === group.groupId }"
          @click="selectGroup(group.groupId)"
        >
          <span class="group-name">{{ group.name }}</span>
          <div class="group-actions">
            <el-icon size="14" @click.stop="editGroup(group)"><Edit /></el-icon>
            <el-icon size="14" @click.stop="deleteGroup(group)"><Delete /></el-icon>
          </div>
        </div>
      </div>
    </div>

    <!-- 右边栏 -->
    <div class="main-content">
      <!-- 工具栏 -->
      <div class="toolbar">
        <el-button size="small" class="btn-primary" style="width: auto !important" :disabled="!selectedGroupId" @click="addCommand">
          <el-icon><Plus /></el-icon>
          {{ t('commandEditor.addCommand') }}
        </el-button>
        <el-button size="small" class="btn-primary" style="width: auto !important" :disabled="!currentRow" @click="insertCommandAbove">
          <el-icon><Edit /></el-icon>
          {{ t('commandEditor.insertCommand') }}
        </el-button>
      </div>

      <!-- 命令表格 -->
      <div class="command-table">
        <el-table
          :data="commands"
          size="small"
          stripe
          style="width: 100%; height: 100%"
          row-key="id"
          :header-cell-style="{ background: 'var(--cmdeditor-table-header-bg)', color: 'var(--cmdeditor-table-header-text)', fontWeight: '600' }"
          :row-class-name="tableRowClassName"
          :highlight-current-row="true"
          :empty-text="t('commandEditor.emptyText')"
          @row-click="handleRowClick"
        >
          <el-table-column :label="t('commandEditor.columnDrag')" width="60" align="center">
            <template #default>
              <el-icon class="drag-handle"><Rank /></el-icon>
            </template>
          </el-table-column>
          <el-table-column :label="t('commandEditor.columnAction')" width="80" align="center">
            <template #default="{ row }">
              <el-tooltip :content="t('commandEditor.deleteCommand')" placement="top" effect="dark" :enterable="false">
                <el-button type="danger" size="small" circle @click="deleteCommand(row)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column :label="t('commandEditor.columnSeqNum')" width="80" align="center" prop="seqNum">
            <template #default="{ row }">
              <el-input-number
                v-model="row.seqNum"
                size="small"
                :min="1"
                :max="999"
                :step="1"
                :controls="false"
                class="cell-seqnum"
                @change="updateCommand(row)"
                @click.stop
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('commandEditor.columnName')" min-width="140" prop="name">
            <template #default="{ row }">
              <el-input
                v-model="row.name"
                size="small"
                class="cell-input"
                @change="updateCommand(row)"
                @blur="updateCommand(row)"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('commandEditor.columnDelay')" width="120" align="center" prop="delay">
            <template #default="{ row }">
              <el-input-number
                v-model="row.delay"
                size="small"
                :min="0"
                :step="100"
                :controls="false"
                class="cell-input cell-delay-input"
                @change="updateCommand(row)"
              />
            </template>
          </el-table-column>
          <el-table-column :label="t('commandEditor.columnContent')" min-width="200">
            <template #default="{ row }">
              <el-input
                v-model="row.command"
                size="small"
                class="cell-command"
                @change="updateCommand(row)"
                @blur="updateCommand(row)"
              />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 分组编辑对话框 -->
    <el-dialog v-model="showGroupDialog" :title="isEditingGroup ? t('commandEditor.editGroupTitle') : t('commandEditor.newGroupTitle')" width="400px" @opened="onGroupDialogOpened">
      <el-form :model="groupForm" label-width="80px" @submit.prevent @keydown.enter="saveGroup">
        <el-form-item :label="t('commandEditor.groupName')">
          <el-input ref="groupNameInputRef" v-model="groupForm.name" :placeholder="t('commandEditor.groupNamePlaceholder')" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button class="btn-cancel" style="width: auto !important" size="small" @click="showGroupDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button size="small" class="btn-primary" style="width: auto !important" @click="saveGroup">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { useI18n } from 'vue-i18n'
import Sortable from 'sortablejs'
import eventBus from '../utils/EventBus'

const { t } = useI18n()

interface CommandGroup {
  groupId: number
  name: string
  connectionType: string
}

const props = withDefaults(defineProps<{
  connectionType?: string
}>(), {
  connectionType: 'telnet'
})

interface PresetCommand {
  id: number
  groupId: number
  name: string
  command: string
  delay: number
  seqNum: number
}

const searchKeyword = ref('')
const groups = ref<CommandGroup[]>([])
const commands = ref<PresetCommand[]>([])
const selectedGroupId = ref<number | null>(null)
const showGroupDialog = ref(false)
const isEditingGroup = ref(false)
const editingGroupId = ref<number | null>(null)
const currentRow = ref<PresetCommand | null>(null)
const groupNameInputRef = ref<HTMLInputElement | null>(null)
const sortableInstance = ref<Sortable | null>(null)

const openGroupDialog = () => {
  resetGroupForm()
  showGroupDialog.value = true
}

const onGroupDialogOpened = () => {
  // 弹窗打开时，选中输入框内容
  nextTick(() => {
    groupNameInputRef.value?.select()
    groupNameInputRef.value?.focus()
  })
}

const groupForm = reactive({
  name: '',
  connectionType: 'telnet'
})

const filteredGroups = computed(() => {
  // 先按协议类型过滤
  let filtered = groups.value.filter(g => g.connectionType === props.connectionType)
  // 再按搜索关键词过滤
  if (!searchKeyword.value) return filtered
  const keyword = searchKeyword.value.toLowerCase()
  return filtered.filter(g => g.name.toLowerCase().includes(keyword))
})

// 辅助函数：从 AppSettings 中获取按协议存储的值，兼容旧格式
const getProtocolValue = (settings: any, key: string, connectionType: string): number | null | undefined => {
  const val = settings?.[key]
  if (val == null) return undefined
  // 新格式：Record<string, number | null>，如 { telnet: 3 }
  if (typeof val === 'object' && !Array.isArray(val)) {
    return val[connectionType] ?? undefined
  }
  // 旧格式兼容：直接是 number 值
  if (typeof val === 'number') {
    return val
  }
  return undefined
}

// 辅助函数：构建按协议存储的 map 并保存
const saveProtocolValue = async (key: string, connectionType: string, value: number | null) => {
  try {
    const currentSettings = await window.storageApi.getAppSettings()
    const map = (currentSettings?.[key] && typeof currentSettings[key] === 'object' && !Array.isArray(currentSettings[key]))
      ? { ...currentSettings[key] }
      : {}
    map[connectionType] = value
    await window.storageApi.saveAppSettings({
      ...currentSettings,
      [key]: map
    })
  } catch {
    // ignore
  }
}

const loadGroups = async () => {
  try {
    groups.value = await window.storageApi.getCommandGroups()
    // 尝试恢复上次选中的分组（按协议类型）
    let restored = false
    try {
      const appSettings = await window.storageApi.getAppSettings()
      const savedId = getProtocolValue(appSettings, 'commandEditorSelectedGroupId', props.connectionType)
      if (savedId != null && filteredGroups.value.some(g => g.groupId === savedId)) {
        selectedGroupId.value = savedId
        restored = true
        await loadCommands()
      }
    } catch {
      // ignore
    }
    // 如果没有恢复成功，选中第一个分组
    if (!restored && !selectedGroupId.value && filteredGroups.value.length > 0) {
      selectedGroupId.value = filteredGroups.value[0].groupId
      await loadCommands()
      saveSelectedGroupId()
    }
  } catch (error) {
    console.error('Failed to load groups:', error)
  }
}

const loadCommands = async () => {
  if (!selectedGroupId.value) {
    commands.value = []
    currentRow.value = null
    return
  }
  try {
    const allCommands = await window.storageApi.getPresetCommands()
    commands.value = allCommands
      .filter((cmd: any) => cmd.groupId === selectedGroupId.value)
      .sort((a: any, b: any) => (a.seqNum ?? 999) - (b.seqNum ?? 999))

    // 尝试恢复上次选中的命令（按协议类型）
    try {
      const appSettings = await window.storageApi.getAppSettings()
      const savedCmdId = getProtocolValue(appSettings, 'commandEditorCurrentCommandId', props.connectionType)
      if (savedCmdId != null) {
        const found = commands.value.find((cmd: any) => cmd.id === savedCmdId)
        if (found) {
          currentRow.value = found
        }
      }
    } catch {
      // ignore
    }

    // 初始化拖拽排序（等待 DOM 更新）
    await nextTick()
    initSortable()
  } catch (error) {
    console.error('Failed to load commands:', error)
  }
}

const tableRowClassName = ({ rowIndex }: { rowIndex: number }) => {
  return rowIndex % 2 === 1 ? 'stripe-row' : ''
}

const saveCurrentCommandId = () => {
  saveProtocolValue('commandEditorCurrentCommandId', props.connectionType, currentRow.value?.id ?? null)
}

const handleRowClick = (row: PresetCommand) => {
  currentRow.value = row
  saveCurrentCommandId()
}

// SortableJS 拖拽排序
const initSortable = () => {
  const tableEl = document.querySelector('.command-table .el-table__body-wrapper tbody')
  if (!tableEl) return

  // 销毁旧实例
  if (sortableInstance.value) {
    sortableInstance.value.destroy()
  }

  sortableInstance.value = Sortable.create(tableEl as HTMLElement, {
    handle: '.drag-handle',
    animation: 200,
    easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
    ghostClass: 'sortable-ghost',
    dragClass: 'sortable-drag',
    onEnd: async (evt) => {
      const { oldIndex, newIndex } = evt
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return

      const list = [...commands.value]
      const [movedItem] = list.splice(oldIndex, 1)
      list.splice(newIndex, 0, movedItem)

      // 重新分配 seqNum
      const updates = list.map((cmd, i) => ({
        id: cmd.id,
        name: cmd.name,
        command: cmd.command,
        delay: cmd.delay,
        seqNum: i + 1,
        groupId: cmd.groupId
      }))

      for (const update of updates) {
        await window.storageApi.updatePresetCommand(update)
      }
      commands.value = list
      eventBus.emit('presetCommandsChanged', props.connectionType)
    }
  })
}

const updateCommand = async (row: PresetCommand) => {
  try {
    await window.storageApi.updatePresetCommand({
      id: row.id,
      name: row.name,
      command: row.command,
      delay: row.delay,
      seqNum: row.seqNum,
      groupId: row.groupId
    })
    // 通知其他组件刷新命令列表
    eventBus.emit('presetCommandsChanged', props.connectionType)
  } catch (error) {
    console.error('Failed to update command:', error)
  }
}

const saveSelectedGroupId = () => {
  saveProtocolValue('commandEditorSelectedGroupId', props.connectionType, selectedGroupId.value)
}

const selectGroup = (groupId: number) => {
  selectedGroupId.value = groupId
  loadCommands()
  saveSelectedGroupId()
}

const saveGroup = async () => {
  if (!groupForm.name) {
    ElMessage.warning(t('commandEditor.pleaseFillGroupName'))
    return
  }
  try {
    if (isEditingGroup.value && editingGroupId.value) {
      await window.storageApi.updateCommandGroup({
        groupId: editingGroupId.value,
        name: groupForm.name,
        connectionType: groupForm.connectionType
      })
    } else {
      await window.storageApi.addCommandGroup({
        name: groupForm.name,
        connectionType: groupForm.connectionType
      })
    }
    showGroupDialog.value = false
    resetGroupForm()
    await loadGroups()
    // 通知其他组件刷新分组列表
    eventBus.emit('commandGroupsChanged', props.connectionType)
  } catch (error) {
    ElMessage.error(t('commandEditor.groupSaveFailed'))
  }
}

const editGroup = (group: CommandGroup) => {
  isEditingGroup.value = true
  editingGroupId.value = group.groupId
  groupForm.name = group.name
  groupForm.connectionType = group.connectionType
  showGroupDialog.value = true
}

const deleteGroup = async (group: CommandGroup) => {
  try {
    await ElMessageBox.confirm(t('commandEditor.confirmDeleteGroup', { name: group.name }), t('common.warning'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      cancelButtonClass: 'el-button--danger'
    })
    await window.storageApi.deleteCommandGroup(group.groupId)
    if (selectedGroupId.value === group.groupId) {
      selectedGroupId.value = null
      commands.value = []
    }
    await loadGroups()
    // 通知其他组件刷新分组列表
    eventBus.emit('commandGroupsChanged', props.connectionType)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(t('commandEditor.groupDeleteFailed'))
    }
  }
}

const addCommand = async () => {
  if (!selectedGroupId.value) return

  try {
    const seqNum = commands.value.length + 1
    const result = await window.storageApi.addPresetCommand({
      name: '',
      command: '',
      delay: 0,
      seqNum: seqNum,
      groupId: selectedGroupId.value
    })
    // 立即刷新表格，获取数据库中的真实数据
    await loadCommands()
    // 通知其他组件刷新命令列表
    eventBus.emit('presetCommandsChanged', props.connectionType)
  } catch (error) {
    console.error('Failed to add command:', error)
  }
}

const insertCommandAbove = async () => {
  if (!currentRow.value || !selectedGroupId.value) return

  try {
    const insertSeq = currentRow.value.seqNum

    // 把被插入位置及之后的命令序号+1
    for (const cmd of commands.value) {
      if ((cmd.seqNum ?? 999) >= insertSeq) {
        await window.storageApi.updatePresetCommand({
          id: cmd.id,
          name: cmd.name,
          command: cmd.command,
          delay: cmd.delay,
          seqNum: (cmd.seqNum ?? 999) + 1,
          groupId: cmd.groupId
        })
      }
    }

    await window.storageApi.addPresetCommand({
      name: '',
      command: '',
      delay: 0,
      seqNum: insertSeq,
      groupId: selectedGroupId.value
    })

    // 重新加载命令列表
    await loadCommands()
    // 通知其他组件刷新命令列表
    eventBus.emit('presetCommandsChanged', props.connectionType)
  } catch (error) {
    console.error('Failed to insert command:', error)
  }
}

const deleteCommand = async (command: PresetCommand) => {
  try {
    await ElMessageBox.confirm(t('commandEditor.confirmDeleteCommand', { name: command.name }), t('common.warning'), {
      confirmButtonText: t('common.confirm'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      cancelButtonClass: 'el-button--danger'
    })
    await window.storageApi.deletePresetCommand(command.id)
    await loadCommands()
    // 通知其他组件刷新命令列表
    eventBus.emit('presetCommandsChanged', props.connectionType)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error(t('commandEditor.commandDeleteFailed'))
    }
  }
}

const resetGroupForm = () => {
  groupForm.name = ''
  groupForm.connectionType = props.connectionType
  isEditingGroup.value = false
  editingGroupId.value = null
}

onMounted(() => {
  loadGroups()
})

onBeforeUnmount(() => {
  if (sortableInstance.value) {
    sortableInstance.value.destroy()
    sortableInstance.value = null
  }
})
</script>

<style scoped>
.command-editor {
  display: flex;
  height: 100%;
  background: var(--cmdeditor-bg);
  color: var(--cmdeditor-table-header-text);
}

.sidebar {
  width: 250px;
  background: var(--cmdeditor-sidebar-bg);
  border-right: 1px solid var(--cmdeditor-sidebar-border);
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--cmdeditor-sidebar-border);
}

.add-group-btn {
  width: 100%;
}

.add-group-btn:hover {
  transform: translateY(-1px);
}

.add-group-btn:disabled {
  cursor: not-allowed;
}

.sidebar-search {
  padding: 8px 12px;
  border-bottom: 1px solid var(--cmdeditor-sidebar-border);
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

/* 左侧组列表滚动条美化 */
.sidebar-list::-webkit-scrollbar {
  width: 6px;
}

.sidebar-list::-webkit-scrollbar-track {
  background: var(--cmdeditor-sidebar-bg);
}

.sidebar-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 3px;
}

.sidebar-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

.sidebar-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.sidebar-item:hover {
  background: var(--cmdeditor-sidebar-item-hover);
}

.sidebar-item.active {
  background: var(--cmdeditor-sidebar-item-active);
}

.sidebar-item .group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-item .group-type {
  font-size: 10px;
  color: var(--cmdeditor-sidebar-group-type);
}

.sidebar-item .group-actions {
  display: none;
  margin-left: 8px;
  gap: 4px;
}

.sidebar-item:hover .group-actions {
  display: flex;
}

.sidebar-item .group-actions .el-icon {
  cursor: pointer;
  padding: 2px;
}

.sidebar-item .group-actions .el-icon:hover {
  color: var(--cmdeditor-sidebar-action-hover);
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  padding: 12px;
  border-bottom: 1px solid var(--cmdeditor-sidebar-border);
  display: flex;
  gap: 8px;
}

.toolbar .el-button:hover {
  transform: translateY(-1px);
}

.toolbar .el-button:disabled {
  cursor: not-allowed;
}

.command-table {
  flex: 1;
  padding: 12px;
  overflow: hidden;
  min-height: 0;
}

.command-table .el-table {
  height: 100%;
  background: var(--cmdeditor-bg);
  color: var(--cmdeditor-table-header-text);
  border-radius: 0;
  border: none !important;
  box-shadow: none !important;
  --el-table-border: none !important;
  --el-table-border-color: transparent !important;
  border-spacing: 0 !important;
  display: flex;
  flex-direction: column;
}

.command-table .el-table * {
  border: none !important;
  border-color: transparent !important;
}

.command-table .el-table::before,
.command-table .el-table::after,
.command-table .el-table .el-table__body-wrapper::before,
.command-table .el-table .el-table__header-wrapper::before,
.command-table .el-table .el-table__header-wrapper::after,
.command-table .el-table .el-table__header th::before,
.command-table .el-table .el-table__header th::after,
.command-table .el-table td::before,
.command-table .el-table td::after,
.command-table .el-table__row::before,
.command-table .el-table__row::after,
.command-table .el-table .el-table__body .el-table__row:last-child td {
  display: none !important;
  height: 0 !important;
  padding-top: 0 !important;
  padding-bottom: 0 !important;
}

/* 隐藏 gutter 列 */
.command-table .el-table .el-table__body .el-table__row td:first-child,
.command-table .el-table .el-table__header th:first-child {
  border-left: none !important;
}

/* 确保表格没有任何底部边框 */
.command-table .el-table,
.command-table .el-table__body,
.command-table .el-table__body-wrapper,
.command-table .el-table__inner-wrapper {
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__header-wrapper) {
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__header) {
  background: var(--cmdeditor-table-header-bg) !important;
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__header th) {
  background: var(--cmdeditor-table-header-bg) !important;
  color: var(--cmdeditor-table-header-text);
  font-weight: 600;
  padding: 12px 8px;
  border: none !important;
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__body-wrapper) {
  flex: 1;
  overflow-y: auto;
}

.command-table .el-table :deep(.el-table__body) {
  background: var(--cmdeditor-table-body-bg) !important;
}

.command-table .el-table :deep(.el-table__body td) {
  background: var(--cmdeditor-table-body-bg) !important;
  padding: 10px 8px;
  border: none !important;
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__body tr) {
  background: var(--cmdeditor-table-body-bg) !important;
}

.command-table .el-table :deep(.el-table__body .el-table__row--striped) {
  background: var(--cmdeditor-table-stripe-bg) !important;
}

.command-table .el-table :deep(.el-table__body .el-table__row--striped td) {
  background: var(--cmdeditor-table-stripe-bg) !important;
}

.command-table .el-table :deep(.stripe-row) {
  background: var(--cmdeditor-table-stripe-bg) !important;
}

/* 拖拽手柄样式 */
.drag-handle {
  cursor: grab;
  color: var(--cmdeditor-drag-handle-color);
  font-size: 16px;
  transition: color 0.2s;
  vertical-align: middle;
}

.drag-handle:hover {
  color: var(--cmdeditor-drag-handle-hover);
}

.drag-handle:active {
  cursor: grabbing;
  color: var(--cmdeditor-drag-handle-hover);
}

/* SortableJS 拖拽动画样式 */
:deep(.sortable-ghost) {
  opacity: 0.4;
  background: var(--cmdeditor-table-hover-bg) !important;
}

:deep(.sortable-ghost td) {
  background: var(--cmdeditor-table-hover-bg) !important;
}

:deep(.sortable-drag) {
  opacity: 0.9;
  background: var(--cmdeditor-table-header-bg) !important;
}

:deep(.sortable-drag td) {
  background: var(--cmdeditor-table-header-bg) !important;
}

/* 隐藏表格空状态下的分隔线 */
.command-table .el-table__empty-block {
  display: none !important;
}

/* 选中行背景 */
.command-table .el-table :deep(.el-table__body tr:hover > td),
.command-table .el-table :deep(.el-table__body .current-row > td) {
  background: var(--cmdeditor-table-hover-bg) !important;
}

/* 单元格输入框统一样式 */
.command-table .el-table :deep(.cell-input .el-input__wrapper),
.command-table .el-table :deep(.cell-seqnum .el-input__wrapper),
.command-table .el-table :deep(.cell-command .el-input__wrapper) {
  background: transparent;
  box-shadow: none;
  padding: 6px 0;
  height: auto;
}

.command-table .el-table :deep(.cell-input .el-input__inner),
.command-table .el-table :deep(.cell-seqnum .el-input__inner),
.command-table .el-table :deep(.cell-command .el-input__inner) {
  background: transparent;
  padding: 0 12px;
  height: auto;
  line-height: 20px;
}

/* el-input-number 样式 */
.command-table .el-table :deep(.cell-seqnum .el-input-number) {
  padding: 6px 0;
  height: auto;
}

.command-table .el-table :deep(.cell-seqnum .el-input-number__inner) {
  padding: 6px 0 !important;
  height: auto !important;
  line-height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.command-table .el-table :deep(.cell-input .el-input__inner:focus),
.command-table .el-table :deep(.cell-seqnum .el-input__inner:focus),
.command-table .el-table :deep(.cell-command .el-input__inner:focus) {
  background: transparent;
}

.command-table .el-table :deep(.cell-input .el-input__inner) {
  color: var(--cmdeditor-table-header-text);
}

.command-table .el-table :deep(.cell-seqnum) {
  width: 40px;
}

.command-table .el-table :deep(.cell-seqnum .el-input-number__inner) {
  width: 40px;
}

.command-table .el-table :deep(.cell-input .el-input-number) {
  width: 60px !important;
  min-width: 60px !important;
  max-width: 60px !important;
}

.command-table .el-table :deep(.cell-input .el-input-number__inner) {
  width: 60px !important;
  min-width: 60px !important;
}

.command-table .el-table :deep(.cell-delay-input) {
  width: 80px !important;
}

.command-table .el-table :deep(.cell-delay-input .el-input-number__inner) {
  width: 60px !important;
}

.command-table .el-table :deep(.cell-seqnum .el-input__inner) {
  color: var(--cmdeditor-seqnum-color);
  text-align: center;
  width: 20px;
}

.command-table .el-table :deep(.cell-command .el-input__inner) {
  color: var(--cmdeditor-command-color);
  font-family: 'Consolas', 'Monaco', monospace;
}

.command-table .el-table :deep(.cell-command .el-input__inner:focus) {
  background: transparent;
}

.command-table .el-table__empty-text {
  color: var(--cmdeditor-empty-text);
  padding: 40px 0;
}

.cmd-name {
  font-weight: 500;
  color: var(--cmdeditor-cmd-name);
}

.cmd-delay {
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--cmdeditor-seqnum-color);
}

.command-content {
  display: flex;
  align-items: center;
}

.command-text {
  display: block;
  max-width: 500px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: 'Consolas', 'Monaco', monospace;
  color: var(--cmdeditor-command-color);
  background: var(--cmdeditor-command-bg);
  padding: 2px 8px;
  border-radius: 4px;
}

/* 滚动条美化 */
.command-table::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.command-table::-webkit-scrollbar-track {
  background: var(--cmdeditor-table-body-bg);
}

.command-table::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb);
  border-radius: 4px;
}

.command-table::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

/* 对话框样式 */
:deep(.el-dialog) {
  background: var(--cmdeditor-dialog-bg);
  border: 1px solid var(--cmdeditor-dialog-border);
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid var(--cmdeditor-dialog-border);
}

:deep(.el-dialog__title) {
  color: var(--cmdeditor-table-header-text);
}

:deep(.el-form-item__label) {
  color: var(--cmdeditor-table-header-text);
}

:deep(.el-input__wrapper) {
  background: var(--cmdeditor-dialog-input-bg);
  box-shadow: 0 0 0 1px var(--cmdeditor-dialog-input-border) inset;
}

:deep(.el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

:deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

:deep(.el-input__inner) {
  color: var(--cmdeditor-table-header-text);
}

:deep(.el-textarea__inner) {
  background: var(--cmdeditor-dialog-input-bg);
  box-shadow: 0 0 0 1px var(--cmdeditor-dialog-input-border) inset;
  color: var(--cmdeditor-table-header-text);
  resize: vertical;
}

:deep(.el-textarea__inner:hover) {
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

:deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

:deep(.el-select .el-input__wrapper) {
  background: var(--cmdeditor-dialog-input-bg);
}
</style>
