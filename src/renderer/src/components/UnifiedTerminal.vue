<template>
  <div :class="['unified-terminal']">

    <!-- 终端输出区域 -->
    <div ref="editorContainer" class="terminal-output" :style="terminalOutputStyle">
      <!-- 滚动按钮 -->
      <div class="scroll-wrapper">
        <el-button icon="ArrowUp" size="mini" circle @click="handleScrollToTop" class="scroll-btn up-btn" />
        <el-button icon="ArrowDown" size="mini" circle @click="handleScrollToBottom" class="scroll-btn down-btn" />
      </div>
    </div>

    <!-- 垂直分隔条 -->
    <div
      class="vertical-splitter"
      @mousedown="startVerticalSplit"
    >
      <div class="splitter-handle"></div>
    </div>

    <!-- 底部控件包裹容器（拖拽后不撑开） -->
    <div class="bottom-controls">


    <!-- 基础操作按钮 -->
    <TerminalControl
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :is-auto-scroll="isAutoScroll"
      :is-show-log="isShowLog"
      :is-show-timestamp="showTimestamp"
      :rx-bytes="rxBytes"
      :tx-bytes="txBytes"
      @on-close="emit('onClose')"
      @on-reconnect="emit('onReconnect')"
      @on-clear-terminal="clearTerminal"
      @on-open-log="emit('onOpenLog')"
      @on-save-log="emit('onSaveLog')"
      @update:is-auto-scroll="isAutoScroll = $event"
      @update:is-show-log="isShowLog = $event"
      @update:is-show-timestamp="showTimestamp = $event"
    />

    <!-- 插槽：用于放置额外内容（如 Com 的波特率设置） -->
    <slot name="extra" />

    <!-- 命令组及命令 -->
    <div class="preset-commands-row">
      <PresetCommands
        :is-connected="isConnected"
        :connection="connection"
        ref="presetCommandsRef"
        @commandSent="handleCommandSent"
        @commandSentContent="appendCommandToTerminal"
        @openCommandEditor="(connectionType: string) => emit('onOpenCommandEditor', connectionType)"
      />
    </div>

    <!-- 命令输入区域 -->
    <div class="terminal-input">
      <!-- 第一行：输入栏 -->
      <div class="input-row">
        <div class="input-controls terminal-switch" v-if="connection?.connectionType === 'com'">
          <el-switch
            width="50"
            v-model="autoNewline"
            active-text="CRLF"
            inactive-text="CRLF"
            inline-prompt
            size="small"
            class="terminal-switch-inline"
            :disabled="!isConnected"
          />
          <el-switch
            width="50"
            v-model="hexMode"
            active-text="HEX"
            inactive-text="STR"
            inline-prompt
            size="small"
            class="terminal-switch-inline"
            :disabled="!isConnected"
          />
        </div>
        <div class="input-wrapper" @click="commandInput?.focus()">
          <textarea
            v-model="currentCommand"
            @keydown="handleInputKeydown"
            :placeholder="isConnected ? (hexMode ? '输入HEX数据 (如: 01 02 03)' : placeholder) : '连接后可发送命令'"
            ref="commandInput"
            class="command-input"
            :class="{ 'not-connected': !isConnected }"
            :disabled="!isConnected"
            @input="onInputChange"
            @focus="onInputFocus"
            @blur="onInputBlur"
            rows="1"
          ></textarea>
          <!-- 历史命令弹窗 -->
          <div v-if="showHistoryPopup && filteredHistory.length > 0" class="history-popup">
            <div
              v-for="(item, index) in filteredHistory"
              :key="index"
              class="history-item"
              :class="{ 'history-item-active': index === historySelectedIndex }"
              @mousedown.prevent="selectHistoryItem(item)"
              @mouseenter="historySelectedIndex = index"
            >
              <span class="history-item-text">{{ item }}</span>
              <span class="history-item-delete" @mousedown.prevent.stop="deleteHistoryItem(item)" :title="t('historySettings.deleteCommand')">×</span>
            </div>
          </div>
        </div>
        <el-button
          icon="Promotion"
          size="small"
          class="btn-primary send-btn"
          @click="handleSendCommand"
          :disabled="!isConnected"
        >
          发送
        </el-button>
      </div>

      <!-- 第二行：CRC 计算栏（仅HEX模式） -->
      <div v-if="hexMode" class="crc-bar">
        <div class="crc-btn-wrapper" ref="crcBtnRef">
          <el-button
            size="small"
            class="btn-primary btn-crc"
            @click="showCrcMenu = !showCrcMenu"
          >
            {{ t('comTerminal.crc') }}
          </el-button>
          <!-- CRC 设置菜单 -->
          <div v-if="showCrcMenu" class="crc-menu" @click.stop>
            <div class="crc-menu-item">
              <span class="crc-menu-label">{{ t('comTerminal.crcEnable') }}</span>
              <el-switch v-model="crcEnabled" size="small" class="terminal-switch" />
            </div>
            <div class="crc-menu-item">
              <span class="crc-menu-label">{{ t('comTerminal.crcMethod') }}</span>
              <el-select v-model="crcMethod" size="small" class="crc-method-select" filterable>
                <el-option
                  v-for="plugin in crcPluginList"
                  :key="plugin.name"
                  :label="plugin.name"
                  :value="plugin.name"
                />
              </el-select>
            </div>
          </div>
        </div>
        <template v-if="crcEnabled">
          <div v-if="crcInputError" class="crc-inline-error">{{ crcInputError }}</div>
          <div v-else-if="!crcInputData" class="crc-inline-empty">{{ t('comTerminal.crcInputEmpty') }}</div>
          <div v-else class="crc-inline-result">
            <span class="crc-inline-label">{{ crcMethodLabel }}</span>
            <span class="crc-inline-value">{{ crcResultDisplay }}</span>
          </div>
        </template>
      </div>
    </div>

    </div> <!-- bottom-controls -->

  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import * as monaco from 'monaco-editor'
import PresetCommands from './PresetCommands.vue'
import TerminalControl from './TerminalControl.vue'

const maxClearSizeMB = ref(30)

const props = withDefaults(defineProps<{
  connection: {
    id: number
    connectionType: string
    comName?: string
    host?: string
    port?: number
    name?: string
    sessionId: string
    [key: string]: any
  }
  isConnected?: boolean
  isConnecting?: boolean
  initMessage?: string
  placeholder?: string
  sessionIdPrefix?: string
}>(), {
  isConnected: false,
  isConnecting: false,
  initMessage: '等待连接...',
  placeholder: '输入命令并按回车发送...',
  sessionIdPrefix: 'terminal'
})

const emit = defineEmits<{
  onClose: []
  onReconnect: []
  onOpenLog: []
  onSaveLog: []
  onSend: [command: string, originalInput?: string]
  onCommandSent: [cmdName: string]
  onDataReceived: [data: string]
  'update:isConnected': [value: boolean]
  onOpenCommandEditor: [connectionType: string]
}>()

const currentCommand = ref('')
const rxBytes = ref('0 B')
const txBytes = ref('0 B')
const commandInput = ref<HTMLTextAreaElement | null>(null)
const isConnected = ref(props.isConnected)
const isConnecting = ref(props.isConnecting)
const isAutoScroll = ref(true)
const isShowLog = ref(true)
const editorContainer = ref<HTMLElement | null>(null)
const terminalOutputHeight = ref<number | null>(null) // null 表示自动撑满
const isSplitting = ref(false)

const terminalOutputStyle = computed(() => {
  if (terminalOutputHeight.value !== null) {
    return { height: terminalOutputHeight.value + 'px', flex: '0 0 auto' }
  }
  return { flex: '1 1 auto' }
})
const autoNewline = ref(true) // 是否自动添加回车换行
const hexMode = ref(false) // 是否为HEX发送模式
const hexDisplayMode = ref(false) // 是否为HEX显示模式（接收端）
const showTimestamp = ref(true) // 是否显示时间戳
const fontSize = ref(14) // 终端字体大小
const fontFamily = ref('Fira Code') // 终端字体系列
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 30

const { t } = useI18n()

// CRC 计算相关（使用 dataCheckApi 动态加载 100+ 种算法）
const showCrcMenu = ref(false)
const crcEnabled = ref(true)
const crcMethod = ref<string>('CRC-16/MODBUS')
const crcBtnRef = ref<HTMLElement | null>(null)
const crcPluginList = ref<{ name: string; type: string }[]>([])
const crcResultDisplay = ref('-')
const crcResultBytes = ref<Uint8Array | null>(null)

const crcMethodLabel = computed(() => crcMethod.value)

// 旧 CRC 方法名 → 新算法名 迁移
const CRC_MIGRATION_MAP: Record<string, string> = {
  'crc8': 'CRC-8/ITU',
  'crc16modbus': 'CRC-16/MODBUS',
  'crc16ccitt': 'CRC-16/CCITT-FALSE',
  'crc32': 'CRC-32'
}

// 点击外部关闭CRC菜单
const handleClickOutsideCrc = (e: MouseEvent) => {
  if (crcBtnRef.value && !crcBtnRef.value.contains(e.target as Node)) {
    showCrcMenu.value = false
  }
}

// 计算CRC的输入数据（根据HEX/STR模式解析，CRLF也计入原始数据）
const crcInputData = computed((): Uint8Array | null => {
  const cmd = currentCommand.value.trim()
  if (!cmd) return null

  try {
    let bytes: Uint8Array
    if (hexMode.value) {
      // HEX模式：解析HEX字符串
      const cleaned = cmd.replace(/[\s\n\r]+/g, '')
      if (!/^[0-9A-Fa-f]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
        return null
      }
      bytes = new Uint8Array(cleaned.length / 2)
      for (let i = 0; i < cleaned.length; i += 2) {
        bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16)
      }
    } else {
      // STR模式
      const encoder = new TextEncoder()
      bytes = encoder.encode(cmd)
    }
    // 如果开启了自动换行，把 CRLF (\r\n) 也作为原始数据参与CRC计算
    if (autoNewline.value) {
      const combined = new Uint8Array(bytes.length + 2)
      combined.set(bytes, 0)
      combined.set([0x0d, 0x0a], bytes.length)
      bytes = combined
    }
    return bytes
  } catch {
    return null
  }
})

// CRC输入错误信息
const crcInputError = computed((): string | null => {
  const cmd = currentCommand.value.trim()
  if (!cmd) return null
  if (hexMode.value) {
    const cleaned = cmd.replace(/[\s\n\r]+/g, '')
    if (!/^[0-9A-Fa-f]*$/.test(cleaned)) {
      return t('comTerminal.crcInvalidHex')
    }
    if (cleaned.length % 2 !== 0) {
      return t('comTerminal.crcInvalidHex')
    }
  }
  return null
})

// 异步 CRC 更新（通过 IPC 调用主进程 DataCheckEngine）
let _crcUpdateSeq = 0
async function updateCrc(): Promise<void> {
  const seq = ++_crcUpdateSeq
  const data = crcInputData.value
  if (!data || !crcEnabled.value || !crcMethod.value) {
    crcResultDisplay.value = '-'
    crcResultBytes.value = null
    return
  }
  try {
    const hexInput = Array.from(data)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join('')
    const result = await window.dataCheckApi.checkData(crcMethod.value, hexInput)
    if (seq !== _crcUpdateSeq) return // 丢弃过期结果
    // 解析 hexResult → Uint8Array
    const hex = result.hexResult
    const byteLen = hex.length / 2
    const bytes = new Uint8Array(byteLen)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    crcResultBytes.value = bytes
    // 空格分隔的十六进制展示
    const parts: string[] = []
    for (let i = 0; i < hex.length; i += 2) {
      parts.push(hex.substring(i, i + 2))
    }
    crcResultDisplay.value = parts.join(' ')
  } catch {
    if (seq !== _crcUpdateSeq) return
    crcResultDisplay.value = 'ERR'
    crcResultBytes.value = null
  }
}

// 监听输入数据 / 算法 / 启用状态变化
watch([crcInputData, crcMethod, crcEnabled], () => {
  updateCrc()
})

// 获取 CRC 的原始二进制字节（用于附加到发送数据，大端序）
const getCrcBytesBinary = (): string | null => {
  const bytes = crcResultBytes.value
  if (!bytes || bytes.length === 0) return null
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return binary
}

// 命令历史相关
const commandHistory = ref<string[]>([])
const showHistoryPopup = ref(false)
const historySelectedIndex = ref(-1)
let historyFilterInput = '' // 导航时的过滤基准，避免选中改变输入后过滤结果变化
let showCommandHistory = true // 是否显示历史命令弹窗
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null
let totalRecvSize = 0
let totalTxSize = 0
let isInternalChange = false // 标记是否由内部触发的 isAutoScroll 变化
let autoScrollToast = true // 固定滚屏时弹出提示（默认开启）
let autoScrollOnFocus = true // 获得焦点时固定滚屏（默认开启）
let autoScrollAfterSend = true // 发送命令后停止滚屏（默认开启）
let autoScrollOnWheel = true // 鼠标滚动决策固定（默认开启）
let toastDebounceTimer: ReturnType<typeof setTimeout> | null = null

const presetCommandsRef = ref<InstanceType<typeof PresetCommands>>()

watch(() => props.isConnected, (val) => {
  isConnected.value = val
})

watch(() => props.isConnecting, (val) => {
  isConnecting.value = val
})

// 监听自动滚动开关的变化
watch(isAutoScroll, (newVal) => {
  if (newVal && !isInternalChange) {
    // 用户打开自动滚动，执行滚动到底部
    scrollToEnd()
  }
  // 如果不是内部触发且 autoScrollToast 开启，且新值为 false，则弹出提示
  if (!isInternalChange && autoScrollToast && !newVal) {
    // 使用防抖避免短时间内多次触发
    if (toastDebounceTimer) {
      clearTimeout(toastDebounceTimer)
    }
    toastDebounceTimer = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('auto-scroll-toast', {
        detail: { connectionName: props.connection.name || '' }
      }))
    }, 300)
  }
  // 如果是由按钮点击触发的变化，重置标记
  if (isInternalChange) {
    isInternalChange = false
  }
})

const initEditor = async () => {
  if (!editorContainer.value) return

  const uniqueUri = monaco.Uri.parse(`${props.sessionIdPrefix}:///output-${props.connection.sessionId}.txt`)
  editorModel = monaco.editor.createModel(
    `${props.initMessage}\n`,
    'plaintext',
    uniqueUri
  )

  editor = monaco.editor.create(editorContainer.value, {
    model: editorModel,
    readOnly: true,
    lineNumbers: 'on',
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    theme: 'vs-dark',
    automaticLayout: true,
    hover: { enabled: false },
    occurrencesHighlight: 'off',
    selectionHighlight: false,
    codeLens: false,
    links: false,
    wordWrap: 'off',
    wrappingStrategy: 'simple',
    fontSize: fontSize.value,
    fontFamily: fontFamily.value
  })

  editor.layout()
  editor.updateOptions({ readOnly: true })

  editor.onMouseDown(() => {
    if (autoScrollOnFocus) {
      isAutoScroll.value = false
    }
  })

  // 监听滚动位置变化（用于检测是否滚动到底部）
  editor.onDidScrollChange(() => {
    if (!autoScrollOnWheel || !editor) return
    const scrollTop = editor.getScrollTop()
    const scrollHeight = editor.getScrollHeight()
    const clientHeight = editor.getLayoutInfo().height
    // 判断是否滚动到底部（容差 5px）
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 5
    if (isAtBottom) {
      // 滚动到底部，启用自动滚动
      isAutoScroll.value = true
    }
  })

  // 在 editor 上监听滚轮事件（用于 Ctrl+滚轮缩放 和 鼠标滚动决策固定）
  const domNode = editor.getDomNode()
  if (domNode) {
    domNode.addEventListener('wheel', (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault()
        const delta = e.deltaY > 0 ? -1 : 1
        const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, fontSize.value + delta))
        if (newSize !== fontSize.value) {
          fontSize.value = newSize
          editor?.updateOptions({ fontSize: newSize })
        }
      } else if (autoScrollOnWheel && e.deltaY < 0) {
        // 向上滚动：停用自动滚动
        isAutoScroll.value = false
      }
    }, { passive: false })
  }
}

const appendToTerminal = (content: string) => {
  if (!editorModel) return

  // 如果不显示日志，直接返回
  if (!isShowLog.value) return

  const lastLine = editorModel.getLineCount()
  let lastCol = 1
  if (lastLine > 0) {
    const lineContent = editorModel.getLineContent(lastLine)
    lastCol = (lineContent ? lineContent.length : 0) + 1
  }

  try {
    editorModel.pushEditOperations(
      [],
      [
        {
          range: new monaco.Range(lastLine, lastCol, lastLine, lastCol),
          text: content,
          forceMoveMarkers: true
        }
      ],
      () => null
    )
  } catch (err) {
    console.error('appendToTerminal error:', err)
    return
  }

  if (isAutoScroll.value) {
    scrollToEnd()
  }

  totalRecvSize += content.length
  rxBytes.value = formatBytes(totalRecvSize)
  if (totalRecvSize > getMaxClearSize()) {
    clearTerminal()
    window.dispatchEvent(new CustomEvent('terminal-text-cleared', { detail: { connectionName: props.connection.name } }))
  }
}

const scrollToEnd = () => {
  if (!editorModel) return
  const newLastLine = editorModel.getLineCount()
  editor?.revealLine(newLastLine)
}

const scrollToStart = () => {
  editor?.revealLine(1)
}

// 点击滚动到底部按钮：滚动到底部，然后取消自动滚动
const handleScrollToBottom = () => {
  scrollToEnd()
  isInternalChange = true
  isAutoScroll.value = false
}

// 点击滚动到顶部按钮：滚动到顶部，然后取消自动滚动
const handleScrollToTop = () => {
  scrollToStart()
  isInternalChange = true
  isAutoScroll.value = false
}

const clearTerminal = () => {
  if (editorModel) {
    editorModel.setValue('')
  }
  totalRecvSize = 0
  rxBytes.value = '0 B'
}

const handleCommandSent = (cmdName: string) => emit('onCommandSent', cmdName)

const handleSendCommand = () => {
  const cmd = currentCommand.value
  if (!cmd.trim()) return

  let sendData: string = cmd
  const originalInput = cmd // 保存原始输入

  // 处理HEX模式
  if (hexMode.value) {
    const parsed = parseHexString(cmd)
    if (parsed === null) {
      return // 无效的HEX格式
    }
    sendData = parsed

    // 先附加回车换行（CRLF属于原始数据的一部分）
    if (autoNewline.value) {
      sendData = sendData + '\r\n'
    }

    // 附加CRC（如果启用，CRC计算的数据已包含CRLF）
    if (crcEnabled.value && crcInputData.value) {
      const crcBytes = getCrcBytesBinary()
      if (crcBytes) {
        sendData = sendData + crcBytes
      }
    }
  } else {
    // 处理回车换行
    if (autoNewline.value) {
      sendData = sendData + '\r\n'
    }
  }

  // 保存命令到历史记录
  addToHistory(originalInput)

  // 传递原始输入用于显示（在HEX模式下需要显示原始HEX字符串）
  emit('onSend', sendData, originalInput)
  closeHistoryPopup()

  // 发送命令后停止滚屏
  if (autoScrollAfterSend) {
    isInternalChange = true
    isAutoScroll.value = false
  }
}

// 命令历史相关方法
const filteredHistory = computed(() => {
  // 导航中用 historyFilterInput 作为过滤基准，避免选中项改变输入后过滤结果变化
  const input = (historySelectedIndex.value >= 0 ? historyFilterInput : currentCommand.value).trim().toLowerCase()
  if (!input) return commandHistory.value
  return commandHistory.value.filter(cmd => cmd.toLowerCase().includes(input))
})

const loadHistory = async () => {
  try {
    const history = await window.storageApi.getCommandHistory(props.connection.connectionType)
    commandHistory.value = history || []
    // 加载显示历史命令的设置
    const settings = await window.storageApi.getSettings()
    showCommandHistory = settings?.showCommandHistory !== false
  } catch (error) {
    console.error('Failed to load command history:', error)
  }
}

const addToHistory = async (command: string) => {
  if (!command.trim()) return
  try {
    await window.storageApi.addCommandHistory(props.connection.connectionType, command)
    // 更新本地列表
    commandHistory.value = commandHistory.value.filter(c => c !== command)
    commandHistory.value.unshift(command)
    // 从设置获取最大数量限制
    const settings = await window.storageApi.getSettings()
    const maxCount = settings?.commandHistoryMaxCount || 10
    if (commandHistory.value.length > maxCount) {
      commandHistory.value = commandHistory.value.slice(0, maxCount)
    }
  } catch (error) {
    console.error('Failed to save command history:', error)
  }
}

const onInputChange = () => {
  historySelectedIndex.value = -1
  historyFilterInput = '' // 用户手动输入时清除导航过滤基准
  if (!showCommandHistory) return
  // 有输入内容时自动弹出历史
  if (currentCommand.value.trim() && filteredHistory.value.length > 0) {
    showHistoryPopup.value = true
  } else if (!currentCommand.value.trim()) {
    // 输入框为空时不弹窗
    showHistoryPopup.value = false
  }
}

const onInputFocus = () => {
  if (!showCommandHistory) return
  // 聚焦时如果有输入内容且有匹配历史，自动弹窗
  if (currentCommand.value.trim() && filteredHistory.value.length > 0) {
    showHistoryPopup.value = true
  }
}

const onInputBlur = () => {
  // 延迟关闭，允许点击历史项
  setTimeout(() => {
    closeHistoryPopup()
  }, 150)
}

const closeHistoryPopup = () => {
  showHistoryPopup.value = false
  historySelectedIndex.value = -1
  historyFilterInput = ''
}

const selectHistoryItem = (item: string) => {
  currentCommand.value = item
  closeHistoryPopup()
  commandInput.value?.focus()
}

const deleteHistoryItem = async (item: string) => {
  try {
    await window.storageApi.removeCommandHistory(props.connection.connectionType, item)
    commandHistory.value = commandHistory.value.filter(c => c !== item)
    // 如果删除后列表为空，关闭弹窗
    if (filteredHistory.value.length === 0) {
      closeHistoryPopup()
    } else if (historySelectedIndex.value >= filteredHistory.value.length) {
      historySelectedIndex.value = filteredHistory.value.length - 1
    }
  } catch (error) {
    console.error('Failed to delete command history:', error)
  }
}

const handleInputKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Enter') {
    // 如果弹窗中有选中项，将选中项填入输入框而非直接发送
    if (showHistoryPopup.value && historySelectedIndex.value >= 0 && historySelectedIndex.value < filteredHistory.value.length) {
      currentCommand.value = filteredHistory.value[historySelectedIndex.value]
      closeHistoryPopup()
      e.preventDefault()
      return
    }
    // Ctrl+Enter 发送，Enter 换行
    if (e.ctrlKey) {
      handleSendCommand()
      return
    }
    // 普通 Enter 换行，不做任何处理
    return
  }

  // 上下键导航历史
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    if (!showCommandHistory) return
    const list = filteredHistory.value
    if (list.length === 0) return

    if (!showHistoryPopup.value) {
      showHistoryPopup.value = true
    }

    e.preventDefault()

    if (e.key === 'ArrowUp') {
      if (historySelectedIndex.value <= 0) {
        if (historySelectedIndex.value === -1) {
          historyFilterInput = currentCommand.value.trim().toLowerCase()
        }
        historySelectedIndex.value = list.length - 1
      } else {
        historySelectedIndex.value--
      }
    } else {
      if (historySelectedIndex.value === -1) {
        historyFilterInput = currentCommand.value.trim().toLowerCase()
        historySelectedIndex.value = 0
      } else if (historySelectedIndex.value >= list.length - 1) {
        historySelectedIndex.value = 0
      } else {
        historySelectedIndex.value++
      }
    }

    return
  }

  // Escape 关闭弹窗
  if (e.key === 'Escape') {
    closeHistoryPopup()
    return
  }
}

// 解析HEX字符串为二进制
const parseHexString = (hex: string): string | null => {
  try {
    // 移除空格和换行
    const cleaned = hex.replace(/[\s\n\r]+/g, '')
    // 验证是否为有效的HEX字符串
    if (!/^[0-9A-Fa-f]*$/.test(cleaned) || cleaned.length % 2 !== 0) {
      console.error('Invalid HEX format')
      return null
    }
    // 转换为二进制字符串
    let result = ''
    for (let i = 0; i < cleaned.length; i += 2) {
      result += String.fromCharCode(parseInt(cleaned.substr(i, 2), 16))
    }
    return result
  } catch (error) {
    console.error('HEX parse error:', error)
    return null
  }
}

const appendCommandToTerminal = (content: string) => {
  const now = new Date()
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
  appendToTerminal(`\n[${timestamp}] SEND>>>>>>>>>>>>> ${content}\n`)
  totalTxSize += content.length
  txBytes.value = formatBytes(totalTxSize)
}

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const updateRxBytes = (_len: number) => {
  rxBytes.value = formatBytes(totalRecvSize)
}

const updateTxBytes = (len: number) => {
  totalTxSize += len
  txBytes.value = formatBytes(totalTxSize)
}

const resetRxTx = () => {
  totalRecvSize = 0
  totalTxSize = 0
  rxBytes.value = '0 B'
  txBytes.value = '0 B'
}

const setConnected = (val: boolean) => {
  isConnected.value = val
  emit('update:isConnected', val)
}

const setConnecting = (val: boolean) => {
  isConnecting.value = val
}

const focusInput = () => {
  commandInput.value?.focus()
}

const getEditorContent = (): string => {
  return editorModel?.getValue() || ''
}

// 暴露给父组件的方法
defineExpose({
  appendToTerminal,
  updateRxBytes,
  updateTxBytes,
  resetRxTx,
  clearTerminal,
  scrollToEnd,
  scrollToStart,
  setConnected,
  setConnecting,
  focusInput,
  getEditorContent,
  editor,
  refreshGroupsCmds: () => presetCommandsRef.value?.refreshGroupsCmds?.(),
  isShowLog,
  setAutoNewline: (val: boolean) => { autoNewline.value = val },
  setHexMode: (val: boolean) => { hexMode.value = val },
  setCrcEnabled: (val: boolean) => { crcEnabled.value = val },
  setCrcMethod: (val: string) => { crcMethod.value = CRC_MIGRATION_MAP[val] || val },
  setHexDisplayMode: (val: boolean) => { hexDisplayMode.value = val },
  setShowTimestamp: (val: boolean) => { showTimestamp.value = val },
  setCommandInput: (val: string) => { currentCommand.value = val },
  getAutoNewline: () => autoNewline.value,
  getHexMode: () => hexMode.value,
  getCrcEnabled: () => crcEnabled.value,
  getCrcMethod: () => crcMethod.value,
  getHexDisplayMode: () => hexDisplayMode.value,
  getShowTimestamp: () => showTimestamp.value,
  getCommandInput: () => currentCommand.value,
  setFontSize: (val: number) => {
    const newSize = Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, val))
    fontSize.value = newSize
    editor?.updateOptions({ fontSize: newSize })
  },
  getFontSize: () => fontSize.value,
  setFontFamily: (val: string) => {
    fontFamily.value = val
    editor?.updateOptions({ fontFamily: val })
  },
  getFontFamily: () => fontFamily.value
})

const getMaxClearSize = () => {
  return (maxClearSizeMB.value || 30) * 1024 * 1024
}

const loadMaxClearSize = async () => {
  try {
    const settings = await window.storageApi.getSettings()
    maxClearSizeMB.value = settings?.maxDisplayText ?? 30
    autoScrollToast = settings?.autoScrollToast !== false
    autoScrollOnFocus = settings?.autoScrollOnFocus !== false
    autoScrollAfterSend = settings?.autoScrollAfterSend !== false
    autoScrollOnWheel = settings?.autoScrollOnWheel === true
  } catch (e) {
    // ignore
  }
}

onMounted(async () => {
  initEditor()
  loadHistory()
  await loadMaxClearSize()

  // 加载数据校验算法列表
  try {
    crcPluginList.value = await window.dataCheckApi.getPlugins()
  } catch (e) {
    console.error('Failed to load CRC plugins:', e)
  }

  // 监听设置更新事件（历史最大数量变化时刷新）
  window.addEventListener('settings-updated', handleSettingsUpdated)
  // 点击外部关闭CRC菜单
  document.addEventListener('click', handleClickOutsideCrc)
})

// 垂直分隔条拖拽逻辑
const startVerticalSplit = (e: MouseEvent) => {
  isSplitting.value = true
  const container = (e.currentTarget as HTMLElement).parentElement
  if (!container) return
  const containerRect = container.getBoundingClientRect()
  const maxHeight = containerRect.height - 6
  const minHeight = 60

  const onMouseMove = (moveEvent: MouseEvent) => {
    const newHeight = moveEvent.clientY - containerRect.top
    if (newHeight >= maxHeight || newHeight <= minHeight) return
    terminalOutputHeight.value = newHeight
  }

  const onMouseUp = () => {
    isSplitting.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'ns-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

onUnmounted(() => {
  if (editorModel) {
    editorModel.dispose()
    editorModel = null
  }

  if (editor) {
    editor.dispose()
    editor = null
  }

  window.removeEventListener('settings-updated', handleSettingsUpdated)
  document.removeEventListener('click', handleClickOutsideCrc)
})

// 设置更新处理
const handleSettingsUpdated = async (event: Event) => {
  const updatedSettings = (event as CustomEvent).detail
  if (updatedSettings) {
    if ('showCommandHistory' in updatedSettings) {
      showCommandHistory = updatedSettings.showCommandHistory !== false
      if (!showCommandHistory) {
        closeHistoryPopup()
      }
    }
    if ('commandHistoryMaxCount' in updatedSettings) {
      // 重新加载历史记录
      await loadHistory()
    }
    if ('maxDisplayText' in updatedSettings) {
      maxClearSizeMB.value = updatedSettings.maxDisplayText ?? 30
    }
    if ('autoScrollToast' in updatedSettings) {
      autoScrollToast = updatedSettings.autoScrollToast !== false
    }
    if ('autoScrollOnFocus' in updatedSettings) {
      autoScrollOnFocus = updatedSettings.autoScrollOnFocus !== false
    }
    if ('autoScrollAfterSend' in updatedSettings) {
      autoScrollAfterSend = updatedSettings.autoScrollAfterSend !== false
    }
    if ('autoScrollOnWheel' in updatedSettings) {
      autoScrollOnWheel = updatedSettings.autoScrollOnWheel === true
    }
  }
}
</script>

<style scoped>
.unified-terminal {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #fff;
  font-family: 'Fira Code', 'Consolas', monospace;
  overflow: hidden;
}

.terminal-output {
  flex: 0 0 auto;
  min-height: 60px;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  line-height: 1.5;
  background-color: #1e1e1e;
  position: relative;
  border: 1px solid transparent;
  transition: border-color 0.2s;
  box-sizing: border-box;
}

.bottom-controls {
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  min-height: 0;
}

.vertical-splitter {
  height: 6px;
  background-color: #2a2a2a;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background-color 0.2s;
}

.vertical-splitter:hover {
  background-color: #409eff;
}

.splitter-handle {
  width: 30px;
  height: 3px;
  border-radius: 2px;
  background-color: #555;
  transition: background-color 0.2s;
}

.vertical-splitter:hover .splitter-handle {
  background-color: #fff;
}

.terminal-output:focus-within {
  border-color: var(--focus-border-color);
}

.preset-commands-row {
  padding: 2px;
  background-color: #252526;
  border-bottom: 1px solid #333;
  border-radius: 6px;
  margin: 2px 4px;
}

.terminal-input {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  margin: 8px 8px 8px 8px;
  border-radius: 6px;
  flex: 1 1 auto;
  min-height: 46px;
  background: transparent;
}

.terminal-input:focus-within {
  border-color: var(--focus-border-color);
}

.input-row {
  display: flex;
  align-items: stretch;
  min-height: 60px;
  flex: 1;
}

.prompt {
  color: #cccccc;
  font-weight: bold;
  white-space: nowrap;
  margin-left: 10px;
  user-select: none;
  padding-top: 10px;
}

.command-input {
  width: 100%;
  height: 100%;
  background: #2a2a2a;
  border: 1px solid transparent;
  border-radius: 4px;
  color: #fff;
  outline: none;
  font-family: monospace;
  font-size: 14px;
  padding: 10px 8px;
  resize: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.command-input:focus {
  border-color: #409eff;
}

.command-input::placeholder {
  color: #666;
}

.command-input:disabled,
.command-input.not-connected {
  opacity: 0.7;
  cursor: not-allowed;
}

.input-controls {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 6px;
  margin-right: 8px;
  margin-left: 0;
  margin-top: 10px;
}

.terminal-switch {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 8px;
  margin-left: 0;
}

.terminal-switch :deep(.el-switch) {
  font-size: 11px;
}

.terminal-switch :deep(.el-switch__core) {
  height: 20px;
  background-color: #131315 !important;
  border-color: transparent !important;
}

.terminal-switch :deep(.el-switch__core:hover) {
  background-color: #2A2A2C !important;
}

.terminal-switch :deep(.el-switch.is-checked .el-switch__core) {
  background-color: #2E5CC7 !important;
}

.terminal-switch :deep(.el-switch.is-checked .el-switch__core:hover) {
  background-color: #2E5CC7 !important;
}

.input-controls :deep(.el-switch__label) {
  font-size: 11px;
}

.send-btn {
  margin-right: 10px;
  margin-left: 12px;
  width: auto !important;
  align-self: flex-end;
  margin-bottom: 2px;
}



.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.scroll-wrapper {
  position: absolute;
  right: 40px;
  bottom: 10px;
  z-index: 10;
  width: 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.scroll-btn {
  width: 32px !important;
  height: 32px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: rgba(50, 50, 51, 0.8) !important;
  border-color: #555 !important;
  color: #fff !important;
  margin: 0 !important;
  padding: 0 !important;
  transition: all 0.2s ease;
}

.scroll-btn:hover {
  background-color: rgba(70, 70, 72, 0.9) !important;
  transform: scale(1.05);
}

.terminal-output::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.terminal-output::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.terminal-output::-webkit-scrollbar-thumb {
  background: #444;
  border-radius: 4px;
}

.terminal-output::-webkit-scrollbar-thumb:hover {
  background: #555;
}

/* 历史命令弹窗 */
.input-wrapper {
  flex: 1;
  min-width: 0;
  position: relative;
  display: flex;
  align-items: stretch;
}

.history-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  background: #2d2d2d;
  border: 1px solid #3c3c3c;
  border-radius: 4px;
  max-height: 240px;
  overflow-y: auto;
  z-index: 100;
  margin-bottom: 2px;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3);
}

.history-item {
  padding: 6px 10px;
  cursor: pointer;
  color: #ccc;
  font-size: 12px;
  font-family: 'Fira Code', 'Consolas', monospace;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border-bottom: 1px solid #3a3a3a;
  display: flex;
  align-items: center;
}

.history-item:last-child {
  border-bottom: none;
}

.history-item:hover {
  background: #094771;
  color: #fff;
}

.history-item-active {
  background: #094771;
  color: #fff;
}

.history-item-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
}

.history-item-delete {
  display: none;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-left: 6px;
  flex-shrink: 0;
  border-radius: 3px;
  color: #888;
  font-size: 14px;
  cursor: pointer;
  text-align: center;
  line-height: 1;
  transition: all 0.15s;
}

.history-item:hover .history-item-delete {
  display: flex;
}

.history-item-delete:hover {
  background: #c43e3e;
  color: #fff;
}

.history-popup::-webkit-scrollbar {
  width: 6px;
}

.history-popup::-webkit-scrollbar-track {
  background: #2d2d2d;
}

.history-popup::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 3px;
}

.history-popup::-webkit-scrollbar-thumb:hover {
  background: #666;
}

/* CRC 按钮 */
.btn-crc {
  font-size: 12px !important;
  padding: 4px 12px !important;
  height: 26px !important;
  flex-shrink: 0;
  width: auto !important;
}

/* CRC按钮容器（相对定位基准） */
.crc-btn-wrapper {
  position: relative;
  flex-shrink: 0;
}

/* CRC 设置下拉菜单 */
.crc-menu {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 0;
  min-width: 200px;
  background: #2d2d2d;
  border: 1px solid #3c3c3c;
  border-radius: 6px;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* CRC 菜单内 switch 样式覆盖 */
.crc-menu :deep(.terminal-switch .el-switch__core) {
  background-color: #131315 !important;
  border-color: transparent !important;
  width: 36px !important;
  height: 18px !important;
  min-height: 18px !important;
  border-radius: 9px !important;
}

.crc-menu :deep(.terminal-switch .el-switch__core::after) {
  width: 14px !important;
  height: 14px !important;
  top: 2px !important;
}

.crc-menu :deep(.terminal-switch .el-switch__core:hover) {
  background-color: #2A2A2C !important;
}

.crc-menu :deep(.terminal-switch.is-checked .el-switch__core) {
  background-color: #2E5CC7 !important;
  border-color: #2E5CC7 !important;
}

.crc-menu-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.crc-menu-label {
  font-size: 12px;
  color: #ccc;
  white-space: nowrap;
}

.crc-method-select {
  width: 130px !important;
}

/* CRC 结果行（输入框下方第二行） */
.crc-bar {
  display: flex;
  align-items: center;
  padding: 4px 8px 4px 0;
  margin-top: 4px;
  border-top: 1px solid #3c3c3c;
  gap: 8px;
  flex-wrap: wrap;
}

.crc-inline-result {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Fira Code', 'Consolas', monospace;
  font-size: 12px;
}

.crc-inline-label {
  color: #999;
}

.crc-inline-value {
  color: #4ec9b0;
  font-weight: 600;
}

.crc-inline-error {
  font-size: 12px;
  color: #f48771;
}

.crc-inline-empty {
  font-size: 12px;
  color: #666;
}

.terminal-input {
  position: relative;
}
</style>
