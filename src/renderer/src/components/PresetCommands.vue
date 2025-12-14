<template>
  <div class="preset-commands">
    <el-button
      type="primary"
      icon="Plus"
      size="small"
      @click="openAddPresetDialog"
      :disabled="!isConnected"
      class="add-preset-btn"
    >
      新增命令
    </el-button>

    <el-button
      v-for="cmd in presetCommands"
      :key="cmd.id"
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

    <!-- 命令编辑对话框 -->
    <el-dialog
      :title="isEditing ? '编辑命令' : '新增命令'"
      v-model="isPresetDialogOpen"
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
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { ElMessage, ElForm, ElInput } from 'element-plus'
import FormUtils from '../utils/FormUtils'

const presetCommands = ref<any[]>([])
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
const presetForm = ref({
  name: '',
  command: '',
  delay: 0
})

// 定义属性
const props = defineProps<{
  isConnected: boolean
  connection: { id: number; host: string; port: number; name?: string }
}>()

// 定义事件
const emit = defineEmits<{
  (e: 'commandSent', cmdName: string): void
  (e: 'commandSentContent', content: string): void
}>()

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

const getCurrentConnect = () => {
  return {
    id: props.connection.id,
    host: props.connection.host,
    port: props.connection.port,
    name: props.connection.name
  }
}

const loadPresetCommands = async () => {
  try {
    const commands = await window.storageApi.getPresetCommands()
    presetCommands.value = Array.isArray(commands) ? commands : []
  } catch (error) {
    console.error('加载命令失败:', error)
    ElMessage.error('加载命令失败')
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

const openAddPresetDialog = () => {
  isEditing.value = false
  currentEditingCmd.value = null
  presetForm.value = {
    name: '',
    command: '',
    delay: 0
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
    delay: cmd.delay
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
      delay: Number(presetForm.value.delay) || 0
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
    window.telnetApi.telnetSend({
      conn: getCurrentConnect(),
      command: cmd.command.trim()
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

// 组件生命周期
onMounted(() => {
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

.add-preset-btn {
  background-color: #165dff !important;
  border-color: #165dff !important;
}

.add-preset-btn:hover {
  background-color: #0e4ada !important;
  transform: translateY(-1px);
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
  background: #2d2d2d !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #fff !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #ccc !important;
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
</style>
