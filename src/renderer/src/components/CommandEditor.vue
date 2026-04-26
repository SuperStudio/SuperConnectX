<template>
  <div class="command-editor">
    <!-- 左边栏 -->
    <div class="sidebar">
      <!-- 添加组按钮 -->
      <div class="sidebar-header">
        <el-button type="primary" size="small" class="add-group-btn" @click="showGroupDialog = true">
          <el-icon><Plus /></el-icon>
          新建分组
        </el-button>
      </div>

      <!-- 搜索框 -->
      <div class="sidebar-search">
        <el-input v-model="searchKeyword" size="small" placeholder="搜索分组..." prefix-icon="Search" clearable />
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
        <el-button type="primary" size="small" :disabled="!selectedGroupId" @click="addCommand">
          <el-icon><Plus /></el-icon>
          添加命令
        </el-button>
        <el-button size="small" :disabled="!currentRow" @click="editCurrentCommand">
          <el-icon><Edit /></el-icon>
          编辑命令
        </el-button>
      </div>

      <!-- 命令表格 -->
      <div class="command-table">
        <el-table
          :data="commands"
          size="small"
          stripe
          style="width: 100%"
          row-key="id"
          :header-cell-style="{ background: '#2d2d2d', color: '#e0e0e0', fontWeight: '600' }"
          :row-class-name="tableRowClassName"
          :highlight-current-row="true"
          empty-text="暂无命令，请点击上方按钮添加"
          @row-click="handleRowClick"
          @row-dblclick="handleRowDblClick"
        >
          <el-table-column label="操作" width="80" align="center">
            <template #default="{ row }">
              <el-tooltip content="删除命令" placement="top">
                <el-button type="danger" size="small" circle @click="deleteCommand(row)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </template>
          </el-table-column>
          <el-table-column label="序号" width="70" align="center" prop="seqNum">
            <template #default="{ row }">
              <el-input-number
                v-model="row.seqNum"
                size="small"
                :min="1"
                :max="999"
                class="cell-number"
                controls-position="right"
                @change="updateCommand(row)"
                @click.stop
              />
            </template>
          </el-table-column>
          <el-table-column label="名称" min-width="140" prop="name">
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
          <el-table-column label="延时(ms)" width="100" align="center" prop="delay">
            <template #default="{ row }">
              <el-input-number
                v-model="row.delay"
                size="small"
                :min="0"
                :step="100"
                class="cell-number"
                controls-position="right"
                @change="updateCommand(row)"
              />
            </template>
          </el-table-column>
          <el-table-column label="命令内容" min-width="200">
            <template #default="{ row }">
              <el-input
                v-model="row.command"
                size="small"
                type="textarea"
                :rows="1"
                class="cell-input cell-textarea"
                @change="updateCommand(row)"
                @blur="updateCommand(row)"
              />
            </template>
          </el-table-column>
        </el-table>
      </div>
    </div>

    <!-- 分组编辑对话框 -->
    <el-dialog v-model="showGroupDialog" :title="isEditingGroup ? '编辑分组' : '新建分组'" width="400px">
      <el-form :model="groupForm" label-width="80px">
        <el-form-item label="分组名称">
          <el-input v-model="groupForm.name" placeholder="请输入分组名称" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="showGroupDialog = false">取消</el-button>
        <el-button size="small" type="primary" @click="saveGroup">确定</el-button>
      </template>
    </el-dialog>

    <!-- 命令编辑对话框 -->
    <el-dialog v-model="showCommandDialog" :title="isEditingCommand ? '编辑命令' : '添加命令'" width="500px">
      <el-form :model="commandForm" label-width="80px">
        <el-form-item label="序号">
          <el-input-number v-model="commandForm.seqNum" :min="1" :max="999" size="small" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="commandForm.name" placeholder="请输入命令名称" />
        </el-form-item>
        <el-form-item label="延时(ms)">
          <el-input-number v-model="commandForm.delay" :min="0" :step="100" size="small" />
        </el-form-item>
        <el-form-item label="命令内容">
          <el-input
            v-model="commandForm.command"
            type="textarea"
            :rows="4"
            placeholder="请输入命令内容"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" @click="showCommandDialog = false">取消</el-button>
        <el-button size="small" type="primary" @click="saveCommand">确定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import eventBus from '../utils/EventBus'

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
const showCommandDialog = ref(false)
const isEditingGroup = ref(false)
const isEditingCommand = ref(false)
const editingGroupId = ref<number | null>(null)
const editingCommandId = ref<number | null>(null)
const currentRow = ref<PresetCommand | null>(null)

const groupForm = reactive({
  name: '',
  connectionType: 'telnet'
})

const commandForm = reactive({
  name: '',
  command: '',
  delay: 0,
  seqNum: 1
})

const filteredGroups = computed(() => {
  // 先按协议类型过滤
  let filtered = groups.value.filter(g => g.connectionType === props.connectionType)
  // 再按搜索关键词过滤
  if (!searchKeyword.value) return filtered
  const keyword = searchKeyword.value.toLowerCase()
  return filtered.filter(g => g.name.toLowerCase().includes(keyword))
})

const loadGroups = async () => {
  try {
    groups.value = await window.storageApi.getCommandGroups()
    // 如果没有选中任何分组，自动选中第一个
    if (!selectedGroupId.value && filteredGroups.value.length > 0) {
      selectedGroupId.value = filteredGroups.value[0].groupId
      await loadCommands()
    }
  } catch (error) {
    console.error('加载分组失败:', error)
  }
}

const loadCommands = async () => {
  if (!selectedGroupId.value) {
    commands.value = []
    return
  }
  try {
    const allCommands = await window.storageApi.getPresetCommands()
    commands.value = allCommands
      .filter((cmd: any) => cmd.groupId === selectedGroupId.value)
      .sort((a: any, b: any) => (a.seqNum ?? 999) - (b.seqNum ?? 999))
  } catch (error) {
    console.error('加载命令失败:', error)
  }
}

const tableRowClassName = ({ rowIndex }: { rowIndex: number }) => {
  return rowIndex % 2 === 1 ? 'stripe-row' : ''
}

const handleRowClick = (row: PresetCommand) => {
  currentRow.value = row
}

const handleRowDblClick = (row: PresetCommand) => {
  editCommand(row)
}

const editCommand = (cmd: PresetCommand) => {
  isEditingCommand.value = true
  editingCommandId.value = cmd.id
  commandForm.name = cmd.name
  commandForm.command = cmd.command
  commandForm.delay = cmd.delay ?? 0
  commandForm.seqNum = cmd.seqNum ?? 1
  showCommandDialog.value = true
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
    console.error('更新命令失败:', error)
  }
}

const selectGroup = (groupId: number) => {
  selectedGroupId.value = groupId
  loadCommands()
}

const saveGroup = async () => {
  if (!groupForm.name) {
    ElMessage.warning('请输入分组名称')
    return
  }
  try {
    if (isEditingGroup.value && editingGroupId.value) {
      await window.storageApi.updateCommandGroup({
        groupId: editingGroupId.value,
        name: groupForm.name,
        connectionType: groupForm.connectionType
      })
      ElMessage.success('分组已更新')
    } else {
      await window.storageApi.addCommandGroup({
        name: groupForm.name,
        connectionType: groupForm.connectionType
      })
      ElMessage.success('分组已创建')
    }
    showGroupDialog.value = false
    resetGroupForm()
    await loadGroups()
    // 通知其他组件刷新分组列表
    eventBus.emit('commandGroupsChanged', props.connectionType)
  } catch (error) {
    ElMessage.error('保存分组失败')
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
    await ElMessageBox.confirm(`确定要删除分组 "${group.name}" 吗？该分组下的所有命令也会被删除。`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await window.storageApi.deleteCommandGroup(group.groupId)
    ElMessage.success('分组已删除')
    if (selectedGroupId.value === group.groupId) {
      selectedGroupId.value = null
      commands.value = []
    }
    await loadGroups()
    // 通知其他组件刷新分组列表
    eventBus.emit('commandGroupsChanged', props.connectionType)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除分组失败')
    }
  }
}

const addCommand = () => {
  isEditingCommand.value = false
  editingCommandId.value = null
  resetCommandForm()
  showCommandDialog.value = true
}

const insertCommand = () => {
  // 插入到当前选中的命令之前
  addCommand()
}

const editCurrentCommand = () => {
  if (currentRow.value) {
    editCommand(currentRow.value)
  }
}

const saveCommand = async () => {
  if (!commandForm.name || !commandForm.command) {
    ElMessage.warning('请填写命令名称和内容')
    return
  }
  try {
    if (isEditingCommand.value && editingCommandId.value) {
      await window.storageApi.updatePresetCommand({
        id: editingCommandId.value,
        name: commandForm.name,
        command: commandForm.command,
        delay: commandForm.delay,
        seqNum: commandForm.seqNum,
        groupId: selectedGroupId.value
      })
      ElMessage.success('命令已更新')
    } else {
      await window.storageApi.addPresetCommand({
        name: commandForm.name,
        command: commandForm.command,
        delay: commandForm.delay,
        seqNum: commandForm.seqNum,
        groupId: selectedGroupId.value
      })
      ElMessage.success('命令已添加')
    }
    showCommandDialog.value = false
    resetCommandForm()
    await loadCommands()
    // 通知其他组件刷新命令列表
    eventBus.emit('presetCommandsChanged', props.connectionType)
  } catch (error) {
    ElMessage.error('保存命令失败')
  }
}

const deleteCommand = async (command: PresetCommand) => {
  try {
    await ElMessageBox.confirm(`确定要删除命令 "${command.name}" 吗？`, '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning'
    })
    await window.storageApi.deletePresetCommand(command.id)
    ElMessage.success('命令已删除')
    await loadCommands()
    // 通知其他组件刷新命令列表
    eventBus.emit('presetCommandsChanged', props.connectionType)
  } catch (error) {
    if (error !== 'cancel') {
      ElMessage.error('删除命令失败')
    }
  }
}

const resetGroupForm = () => {
  groupForm.name = ''
  groupForm.connectionType = props.connectionType
  isEditingGroup.value = false
  editingGroupId.value = null
}

const resetCommandForm = () => {
  commandForm.name = ''
  commandForm.command = ''
  commandForm.delay = 0
  commandForm.seqNum = commands.value.length + 1
  isEditingCommand.value = false
  editingCommandId.value = null
}

onMounted(() => {
  loadGroups()
})
</script>

<style scoped>
.command-editor {
  display: flex;
  height: 100%;
  background: #1e1e1e;
  color: #e0e0e0;
}

.sidebar {
  width: 250px;
  background: #252526;
  border-right: 1px solid #3c3c3c;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid #3c3c3c;
}

.add-group-btn {
  width: 100%;
  background-color: #1A97ED !important;
  border-color: #1A97ED !important;
}

.sidebar-search {
  padding: 8px 12px;
  border-bottom: 1px solid #3c3c3c;
}

.sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.sidebar-item {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.sidebar-item:hover {
  background: #2a2d2e;
}

.sidebar-item.active {
  background: #094771;
}

.sidebar-item .group-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-item .group-type {
  font-size: 10px;
  color: #888;
  margin-left: 8px;
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
  color: #fff;
}

.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.toolbar {
  padding: 12px;
  border-bottom: 1px solid #3c3c3c;
  display: flex;
  gap: 8px;
}

.toolbar .el-button {
  background-color: #3a3a3a;
  border-color: #444;
  color: #e0e0e0;
}

.toolbar .el-button:hover {
  background-color: #4a4a4a;
}

.toolbar .el-button--primary {
  background-color: #1A97ED !important;
  border-color: #1A97ED !important;
}

.command-table {
  flex: 1;
  padding: 12px;
  overflow: auto;
}

.command-table {
  flex: 1;
  padding: 12px;
  overflow: hidden;
}

.command-table .el-table {
  background: #1e1e1e;
  color: #e0e0e0;
  border-radius: 0;
  overflow: hidden;
  border: none !important;
  box-shadow: none !important;
  --el-table-border: none !important;
  --el-table-border-color: transparent !important;
  border-spacing: 0 !important;
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
  background: #2d2d2d !important;
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__header th) {
  background: #2d2d2d !important;
  color: #e0e0e0;
  font-weight: 600;
  padding: 12px 8px;
  border: none !important;
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__body) {
  background: #1e1e1e !important;
}

.command-table .el-table :deep(.el-table__body td) {
  background: #1e1e1e !important;
  padding: 10px 8px;
  border: none !important;
  border-bottom: none !important;
}

.command-table .el-table :deep(.el-table__body tr) {
  background: #1e1e1e !important;
}

.command-table .el-table :deep(.el-table__body .el-table__row--striped) {
  background: #252526 !important;
}

.command-table .el-table :deep(.el-table__body .el-table__row--striped td) {
  background: #252526 !important;
}

.command-table .el-table :deep(.stripe-row) {
  background: #252526 !important;
}

/* 隐藏表格空状态下的分隔线 */
.command-table .el-table__empty-block {
  display: none !important;
}

/* 选中行背景 */
.command-table .el-table :deep(.el-table__body tr:hover > td),
.command-table .el-table :deep(.el-table__body .current-row > td) {
  background: #094771 !important;
}

/* 单元格输入框样式 */
.command-table .el-table :deep(.cell-input .el-input__wrapper) {
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.command-table .el-table :deep(.cell-input .el-input__inner) {
  color: #e0e0e0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0 6px;
  height: 28px;
}

.command-table .el-table :deep(.cell-input .el-input__inner:focus) {
  border-color: #007FD4;
  background: #2d2d2d;
}

.command-table .el-table :deep(.cell-number) {
  width: 80px;
}

.command-table .el-table :deep(.cell-number .el-input__wrapper) {
  background: transparent;
  box-shadow: none;
  padding: 0;
}

.command-table .el-table :deep(.cell-number .el-input__inner) {
  color: #7ec699;
  background: transparent;
  text-align: center;
}

.command-table .el-table :deep(.cell-textarea .el-textarea__inner) {
  color: #ce9178;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0 6px;
  resize: none;
  font-family: 'Consolas', 'Monaco', monospace;
}

.command-table .el-table :deep(.cell-textarea .el-textarea__inner:focus) {
  border-color: #007FD4;
  background: #2d2d2d;
}

.command-table .el-table__empty-text {
  color: #888;
  padding: 40px 0;
}

.cmd-name {
  font-weight: 500;
  color: #fff;
}

.cmd-delay {
  font-family: 'Consolas', 'Monaco', monospace;
  color: #7ec699;
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
  color: #ce9178;
  background: #2d2d2d;
  padding: 2px 8px;
  border-radius: 4px;
}

/* 滚动条美化 */
.command-table::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.command-table::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.command-table::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.command-table::-webkit-scrollbar-thumb:hover {
  background: #666;
}

/* 对话框样式 */
:deep(.el-dialog) {
  background: #2d2d2d;
  border: 1px solid #444;
}

:deep(.el-dialog__header) {
  border-bottom: 1px solid #444;
}

:deep(.el-dialog__title) {
  color: #e0e0e0;
}

:deep(.el-form-item__label) {
  color: #e0e0e0;
}

:deep(.el-input__wrapper) {
  background: #3a3a3a;
  box-shadow: 0 0 0 1px #444 inset;
}

:deep(.el-input__inner) {
  color: #e0e0e0;
}

:deep(.el-select .el-input__wrapper) {
  background: #3a3a3a;
}
</style>
