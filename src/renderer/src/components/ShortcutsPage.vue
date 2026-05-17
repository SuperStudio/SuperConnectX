<template>
  <div class="shortcuts-page">
    <!-- 搜索框 -->
    <div class="shortcuts-search">
      <div class="search-inner">
        <input
          type="text"
          placeholder="搜索..."
          v-model="searchKeyword"
          class="search-input"
        />
        <button class="clear-btn" @click="clearSearch" v-if="searchKeyword">×</button>
      </div>
    </div>

    <!-- 快捷键表格 -->
    <div class="shortcuts-table">
      <el-table
        :data="filteredShortcuts"
        size="small"
        stripe
        style="width: 100%; height: 100%"
        :header-cell-style="{ background: '#2d2d2d', color: '#e0e0e0', fontWeight: '600' }"
        empty-text="暂无快捷键"
        @row-dblclick="handleRowDblClick"
      >
        <el-table-column label="操作" min-width="200" prop="action">
          <template #default="{ row }">
            <span class="action-text">{{ row.action }}</span>
          </template>
        </el-table-column>
        <el-table-column label="快捷键" width="220" align="center">
          <template #default="{ row }">
            <div class="shortcut-keys">
              <span
                v-for="(key, index) in row.keys"
                :key="index"
                class="key-badge"
              >{{ key }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 修改快捷键对话框 -->
    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="400px"
      :close-on-click-modal="false"
      class="shortcut-dialog"
    >
      <div class="dialog-content">
        <p class="dialog-tip">输入快捷键并按回车修改</p>
        
        <input
          ref="keyInputRef"
          type="text"
          v-model="inputKeys"
          class="key-input"
          @keydown="handleKeyDown"
          placeholder="请按下快捷键..."
          autofocus
        />
        
        <div class="preview-section">
          <div class="preview-label">预览：</div>
          <div class="shortcut-keys preview-keys">
            <span
              v-for="(key, index) in previewKeys"
              :key="index"
              class="key-badge"
            >{{ key }}</span>
          </div>
        </div>
        
        <div class="validation-message" :class="validationStatus" v-if="validationStatus === 'conflict' || validationStatus === 'invalid'">
          {{ validationMessage }}
        </div>
      </div>
      
      <template #footer>
        <el-button type="danger" style="width: 100px" @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" style="width: 100px" class="vscode-btn" :disabled="!canConfirm" @click="confirmShortcut">
          确定
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick, watch, toRaw } from 'vue'

interface ShortcutItem {
  action: string
  keys: string[]
}

const searchKeyword = ref('')

// 快捷键列表数据
const shortcuts = ref<ShortcutItem[]>([
  { action: '新建连接', keys: ['Ctrl', 'N'] },
  { action: '打开连接', keys: ['Ctrl', 'O'] },
  { action: '保存连接', keys: ['Ctrl', 'S'] },
  { action: '关闭当前标签', keys: ['Ctrl', 'W'] },
  { action: '刷新串口列表', keys: ['F5'] },
  { action: '连接串口', keys: ['Enter'] },
  { action: '断开连接', keys: ['Ctrl', 'D'] },
  { action: '发送命令', keys: ['Enter'] },
  { action: '清空终端', keys: ['Ctrl', 'L'] },
  { action: '搜索终端输出', keys: ['Ctrl', 'F'] },
  { action: '打开设置', keys: ['Ctrl', ','] },
  { action: '切换到上一个标签', keys: ['Ctrl', 'Tab'] },
  { action: '切换到下一个标签', keys: ['Ctrl', 'Shift', 'Tab'] },
  { action: '固定/取消固定标签', keys: ['Ctrl', 'P'] },
  { action: '全局焦点切换', keys: ['Ctrl', '`'] },
  { action: '复制选中内容', keys: ['Ctrl', 'C'] },
  { action: '粘贴到终端', keys: ['Ctrl', 'Shift', 'V'] },
  { action: '全选终端内容', keys: ['Ctrl', 'A'] },
  { action: '打开命令编辑器', keys: ['Ctrl', 'E'] },
  { action: '切换连接列表', keys: ['Ctrl', 'B'] },
])

// 对话框相关
const dialogVisible = ref(false)
const currentEditIndex = ref(-1)
const currentAction = ref('')
const inputKeys = ref('')
const previewKeys = ref<string[]>([])
const validationMessage = ref('')
const validationStatus = ref<'valid' | 'conflict' | 'invalid' | ''>('')
const keyInputRef = ref<HTMLInputElement | null>(null)

// 对话框标题
const dialogTitle = computed(() => {
  return currentAction.value ? `修改快捷键 : ${currentAction.value}` : '修改快捷键'
})

// 有效的修饰键
const modifierKeys = ['Ctrl', 'Alt', 'Shift', 'Meta', 'Control', 'Cmd', 'Command', 'CommandOrControl', 'Super', 'Hyper', 'Meta']

// 有效的单键（排除纯修饰键和无意义键）
const validSingleKeys = [
  // 字母键
  'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
  // 数字键
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  // 功能键
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
  // 符号键
  '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/', '`',
  // 特殊键
  'Space', 'Tab', 'Enter', 'Backspace', 'Delete', 'Insert', 'Home', 'End',
  'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right',
  // 小键盘
  'Num0', 'Num1', 'Num2', 'Num3', 'Num4', 'Num5', 'Num6', 'Num7', 'Num8', 'Num9',
  'NumAdd', 'NumSubtract', 'NumMultiply', 'NumDivide', 'NumDecimal', 'NumEnter',
  // 多媒体键
  'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaPlayPause', 'MediaStop', 'MediaNext', 'MediaPrevious',
  // 其他
  'CapsLock', 'NumLock', 'ScrollLock', 'PrintScreen', 'Pause', 'Escape', 'Esc',
]

// 标准化键名
const normalizeKey = (key: string): string => {
  const upperKey = key.toUpperCase()
  const lowerKey = key.toLowerCase()
  
  // 修饰键标准化
  if (['CONTROL', 'CMD', 'COMMAND', 'COMMANDORCONTROL', 'SUPER', 'HYPER'].includes(upperKey)) {
    return 'Ctrl'
  }
  if (['ALT', 'OPTION'].includes(upperKey)) {
    return 'Alt'
  }
  if (upperKey === 'META' || upperKey === 'WIN' || upperKey === 'WINDOWS') {
    return 'Meta'
  }
  
  // 特殊键标准化
  if (upperKey === 'ESCAPE' || upperKey === 'ESC') return 'Esc'
  
  // 数字小键盘标准化
  if (upperKey.startsWith('NUMPAD') || upperKey.startsWith('NUM')) {
    const num = upperKey.replace(/^NUM(PAD)?/, '')
    const numMap: Record<string, string> = {
      '0': 'Num0', '1': 'Num1', '2': 'Num2', '3': 'Num3', '4': 'Num4',
      '5': 'Num5', '6': 'Num6', '7': 'Num7', '8': 'Num8', '9': 'Num9',
      'ADD': 'NumAdd', 'SUBTRACT': 'NumSubtract', 'MULTIPLY': 'NumMultiply',
      'DIVIDE': 'NumDivide', 'DECIMAL': 'NumDecimal', 'ENTER': 'NumEnter',
    }
    return numMap[num] || key
  }
  
  // 如果是单字符字母，转为大写
  if (/^[a-zA-Z]$/.test(key)) {
    return key.toUpperCase()
  }
  
  return key
}

// 验证快捷键是否有效
const validateShortcut = (keys: string[]): { valid: boolean; message: string; status: 'valid' | 'conflict' | 'invalid' | '' } => {
  if (keys.length === 0) {
    return { valid: false, message: '', status: '' }
  }
  
  if (keys.length === 1) {
    const key = normalizeKey(keys[0])
    // 纯修饰键无效
    if (modifierKeys.map(k => k.toLowerCase()).includes(key.toLowerCase())) {
      return { valid: false, message: '不能只使用修饰键（如 Ctrl、Alt）', status: 'invalid' }
    }
    // Enter 无效
    if (key.toLowerCase() === 'enter') {
      return { valid: false, message: 'Enter 键不能作为快捷键', status: 'invalid' }
    }
    // 单个字母或数字无效
    if (/^[A-Z0-9]$/.test(key)) {
      return { valid: false, message: '单个字母或数字不能作为快捷键', status: 'invalid' }
    }
    // 单个功能键或特殊键有效
    const validKeys = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
      'space', 'tab', 'backspace', 'delete', 'insert', 'home', 'end',
      'pageup', 'pagedown', 'up', 'down', 'left', 'right', 'escape', 'esc',
      'num0', 'num1', 'num2', 'num3', 'num4', 'num5', 'num6', 'num7', 'num8', 'num9',
      'numadd', 'numsubtract', 'nummultiply', 'numdivide', 'numdecimal', 'numenter',
      'volumeup', 'volumedown', 'volumemute', 'mediaplaypause', 'mediastop', 'medianext', 'mediaprevious',
      'capslock', 'numlock', 'scrolllock', 'printscreen', 'pause',
      '-', '=', '[', ']', '\\', ';', "'", ',', '.', '/', '`']
    if (!validKeys.includes(key.toLowerCase())) {
      return { valid: false, message: '无效的快捷键', status: 'invalid' }
    }
    // 单个功能键或特殊键直接返回有效
    return { valid: true, message: '快捷键可用', status: 'valid' }
  }
  
  // 检查是否至少有一个非修饰键
  const hasNonModifier = keys.some(k => {
    const key = normalizeKey(k)
    return !modifierKeys.map(m => m.toLowerCase()).includes(key.toLowerCase())
  })
  
  if (!hasNonModifier) {
    return { valid: false, message: '必须包含至少一个非修饰键', status: 'invalid' }
  }
  
  // 系统保留快捷键检查
  const normalizedKeys = keys.map(k => normalizeKey(k))
  const hasCtrl = normalizedKeys.some(k => k === 'Ctrl')
  const hasShift = normalizedKeys.some(k => k === 'Shift')
  const hasAlt = normalizedKeys.some(k => k === 'Alt')
  const nonModifierKey = normalizedKeys.find(k => !['Ctrl', 'Alt', 'Shift', 'Meta'].includes(k))
  
  // 系统保留的 Ctrl/Ctrl+Shift/Ctrl+Alt 组合
  const systemReservedCombos = [
    // Ctrl 系列
    ['Ctrl', 'C'], ['Ctrl', 'V'], ['Ctrl', 'X'],
    // Ctrl+Alt 系列
    ['Ctrl', 'Alt', 'Delete'], ['Ctrl', 'Alt', 'End'], ['Ctrl', 'Alt', 'Home'],
  ]
  
  for (const reserved of systemReservedCombos) {
    if (normalizedKeys.length === reserved.length &&
        reserved.every(k => normalizedKeys.includes(k))) {
      return { valid: false, message: '系统保留快捷键，无法使用', status: 'invalid' }
    }
  }
  
  // 检查冲突
  for (let i = 0; i < shortcuts.value.length; i++) {
    if (i === currentEditIndex.value) continue
    
    const existing = shortcuts.value[i].keys.map(k => normalizeKey(k))
    if (normalizedKeys.length === existing.length && 
        normalizedKeys.every(k => existing.includes(k))) {
      return { 
        valid: false, 
        message: `与「${shortcuts.value[i].action}」的快捷键冲突`, 
        status: 'conflict' 
      }
    }
  }
  
  return { valid: true, message: '快捷键可用', status: 'valid' }
}

// 处理键盘按下
const handleKeyDown = (e: KeyboardEvent) => {
  e.preventDefault()
  e.stopPropagation()
  
  const key = e.key
  
  // ESC 或 Backspace 清空输入框
  if (key === 'Escape' || key === 'Esc' || key === 'Backspace') {
    previewKeys.value = []
    inputKeys.value = ''
    validationMessage.value = ''
    validationStatus.value = ''
    return
  }
  
  // Enter 确认修改
  if (key === 'Enter') {
    if (canConfirm.value) {
      confirmShortcut()
    }
    return
  }
  
  const keys: string[] = []
  const isModifierKey = ['Control', 'Alt', 'Shift', 'Meta'].includes(key)
  
  // 收集修饰键
  if (e.ctrlKey) keys.push('Ctrl')
  if (e.altKey) keys.push('Alt')
  if (e.shiftKey) keys.push('Shift')
  if (e.metaKey) keys.push('Meta')
  
  // 如果只按了修饰键，显示修饰键即可
  if (isModifierKey && keys.length > 0) {
    previewKeys.value = keys
    inputKeys.value = keys.join(' + ')
    validationMessage.value = ''
    validationStatus.value = ''
    return
  }
  
  // 添加按下的非修饰键
  const normalizedKey = normalizeKey(key)
  if (!modifierKeys.map(k => k.toLowerCase()).includes(normalizedKey.toLowerCase())) {
    keys.push(normalizedKey)
  }
  
  if (keys.length > 0) {
    previewKeys.value = keys
    inputKeys.value = keys.join(' + ')
    
    const result = validateShortcut(keys)
    validationMessage.value = result.message
    validationStatus.value = result.status
  }
}

// 双击表格行
const handleRowDblClick = (row: ShortcutItem, index: number) => {
  currentEditIndex.value = shortcuts.value.findIndex(s => s.action === row.action)
  currentAction.value = row.action
  previewKeys.value = [...row.keys]
  inputKeys.value = row.keys.join(' + ')
  validationMessage.value = ''
  validationStatus.value = ''
  dialogVisible.value = true
  
  nextTick(() => {
    keyInputRef.value?.focus()
  })
}

// 确认修改
const confirmShortcut = async () => {
  if (!canConfirm.value) return
  
  const currentKeys = [...previewKeys.value]
  
  // 检查是否有冲突，将冲突的快捷键清空
  for (let i = 0; i < shortcuts.value.length; i++) {
    if (i === currentEditIndex.value) continue
    
    const existing = shortcuts.value[i].keys.map(k => normalizeKey(k))
    const normalizedKeys = currentKeys.map(k => normalizeKey(k))
    
    if (normalizedKeys.length === existing.length && 
        normalizedKeys.every(k => existing.includes(k))) {
      shortcuts.value[i].keys = []
    }
  }
  
  shortcuts.value[currentEditIndex.value].keys = currentKeys
  
  try {
    const dataToSave = shortcuts.value.map(item => ({
      action: item.action,
      keys: [...item.keys]
    }))
    await window.storageApi.saveShortcuts(dataToSave)
  } catch (error) {
    console.error('保存快捷键失败:', error)
  }
  
  dialogVisible.value = false
}

// 是否为有效快捷键
const isValidShortcut = computed(() => {
  return validationStatus.value === 'valid' && previewKeys.value.length > 0
})

// 是否为系统保留快捷键
const isSystemReserved = computed(() => {
  if (previewKeys.value.length === 0) return false
  
  const normalizedKeys = previewKeys.value.map(k => normalizeKey(k))
  const systemReservedCombos = [
    ['Ctrl', 'C'], ['Ctrl', 'V'], ['Ctrl', 'X'],
    ['Ctrl', 'Alt', 'Delete'], ['Ctrl', 'Alt', 'End'], ['Ctrl', 'Alt', 'Home'],
  ]
  
  return systemReservedCombos.some(reserved => 
    normalizedKeys.length === reserved.length &&
    reserved.every(k => normalizedKeys.includes(k))
  )
})

// 是否可以确认
const canConfirm = computed(() => {
  return previewKeys.value.length > 0 && !isSystemReserved.value
})

// 加载快捷键数据
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

onMounted(() => {
  loadShortcuts()
})

// 监听对话框打开，获得焦点
watch(dialogVisible, (val) => {
  if (val) {
    setTimeout(() => {
      keyInputRef.value?.focus()
      keyInputRef.value?.select()
    }, 100)
  }
})

// 过滤后的快捷键列表
const filteredShortcuts = computed(() => {
  if (!searchKeyword.value.trim()) {
    return shortcuts.value
  }
  const keyword = searchKeyword.value.toLowerCase()
  return shortcuts.value.filter(item =>
    item.action.toLowerCase().includes(keyword) ||
    item.keys.some(key => key.toLowerCase().includes(keyword))
  )
})

const clearSearch = () => {
  searchKeyword.value = ''
}
</script>

<style scoped>
.shortcuts-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background: #1e1e1e;
  gap: 12px;
}

.shortcuts-search {
  flex-shrink: 0;
  padding: 0;
}

.search-inner {
  position: relative;
  width: 100%;
  height: 32px;
}

.search-input {
  width: 100%;
  height: 100%;
  padding: 0 28px 0 12px;
  border: 1px solid transparent;
  background-color: #3c3c3c;
  color: #cccccc;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #007fd4;
  box-shadow: 0 0 0 1px #007fd4 inset;
}

.clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.clear-btn:hover {
  color: #111827;
}

.shortcuts-table {
  flex: 1;
  min-height: 0;
  padding-bottom: 32px;
}

.shortcuts-table :deep(.el-table) {
  background: #1e1e1e;
  color: #e0e0e0;
  border-radius: 4px;
  border: 1px solid #3a3a3a;
  --el-table-border: none !important;
  --el-table-border-color: transparent !important;
}

.shortcuts-table :deep(.el-table__header-wrapper th) {
  background: #2d2d2d !important;
  color: #e0e0e0;
  font-weight: 600;
  border-bottom: 1px solid #3a3a3a !important;
}

.shortcuts-table :deep(.el-table__body-wrapper) {
  background: #1e1e1e;
}

.shortcuts-table :deep(.el-table__body tr) {
  background: #1e1e1e;
}

.shortcuts-table :deep(.el-table__body tr:hover > td) {
  background: #094771 !important;
}

.shortcuts-table :deep(.el-table__body td) {
  background: #1e1e1e;
  border-bottom: 1px solid #2d2d2d !important;
}

.shortcuts-table :deep(.el-table__body .el-table__row--striped td) {
  background: #252526 !important;
}

.shortcuts-table :deep(.el-table__empty-text) {
  color: #888;
  padding: 40px 0;
}

.action-text {
  color: #e0e0e0;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-wrap: wrap;
}

.key-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #3a3a3a;
  color: #e0e0e0;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  border-radius: 4px;
  border: 1px solid #555;
  white-space: nowrap;
}

/* 滚动条美化 */
.shortcuts-table::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.shortcuts-table::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.shortcuts-table::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.shortcuts-table::-webkit-scrollbar-thumb:hover {
  background: #666;
}

/* 对话框样式 */
.dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.dialog-tip {
  color: #888;
  font-size: 13px;
  margin: 0;
}

.key-input {
  width: 100%;
  height: 36px;
  padding: 0 12px;
  border: 1px solid #3a3a3a;
  background-color: #3c3c3c;
  color: #cccccc;
  border-radius: 4px;
  font-size: 14px;
  outline: none;
  box-sizing: border-box;
}

.key-input:focus {
  border-color: #007fd4;
}

.key-input::placeholder {
  color: #666;
}

.preview-section {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 32px;
}

.preview-label {
  color: #888;
  font-size: 13px;
  flex-shrink: 0;
}

.preview-keys {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.validation-message {
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 4px;
  background: #2d2d2d;
}

.validation-message.valid {
  color: #4caf50;
  background: rgba(76, 175, 80, 0.1);
}

.validation-message.conflict {
  color: #ff9800;
  background: rgba(255, 152, 0, 0.1);
}

.validation-message.invalid {
  color: #f44336;
  background: rgba(244, 67, 54, 0.1);
}

/* 对话框深色主题覆盖 */
:deep(.shortcut-dialog) {
  --el-bg-color: #252526;
  --el-text-color-primary: #e0e0e0;
  --el-border-color: #3a3a3a;
}

:deep(.shortcut-dialog .el-dialog) {
  background: #252526;
  border: 1px solid #3a3a3a;
}

:deep(.shortcut-dialog .el-dialog__header) {
  border-bottom: 1px solid #3a3a3a;
}

:deep(.shortcut-dialog .el-dialog__title) {
  color: #e0e0e0;
}

:deep(.shortcut-dialog .el-dialog__body) {
  color: #e0e0e0;
}

:deep(.shortcut-dialog .el-dialog__footer) {
  border-top: 1px solid #3a3a3a;
}
</style>
