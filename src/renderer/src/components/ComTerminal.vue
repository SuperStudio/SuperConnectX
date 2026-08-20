<template>
  <div class="com-terminal">
    <UnifiedTerminal
      ref="unifiedTerminalRef"
      :connection="connection"
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :init-message="t('comTerminal.waiting', { port: connection.comName })"
      :placeholder="t('comTerminal.placeholder')"
      session-id-prefix="com"
      @on-close="handleClose"
      @on-reconnect="reconnect"
      @on-open-log-folder="openLogFolder"
      @on-open-log-file="openLogFile"
      @on-save-log="saveLog"
      @on-send="handleSendCommand"
      @on-command-sent="handleCommandSent"
      @on-open-command-editor="emit('openCommandEditor', connection.connectionType)"
      @on-edit-syntax-rules="emit('openSyntaxHighlight')"
    >
      <!-- 波特率等设置放到下面 -->
      <template #extra>
        <div class="param-row">
          <el-switch
            v-model="hexDisplayMode"
            width="50"
            active-text="HEX"
            inactive-text="STR"
            inline-prompt
            size="small"
            class="terminal-switch terminal-switch-inline"
          />
          <div class="param-item">
            <span class="param-label">{{ t('comTerminal.baudRate') }}</span>
            <el-select v-model="baudRate" size="small" class="param-select-baud" :popper-append-to-body="false">
              <el-option :label="t('serialSettings.addNew') + '...'" value="__add__" />
              <el-option
                v-for="br in baudRates"
                :key="br"
                :label="br"
                :value="br"
              >
                <div class="baud-option">
                  <span>{{ br }}</span>
                  <el-icon class="delete-icon" @click.prevent.stop="deleteBaudRate(br)"><Close /></el-icon>
                </div>
              </el-option>
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">{{ t('comTerminal.encoding') }}</span>
            <el-select v-model="encoding" size="small" class="param-select-encoding" :popper-append-to-body="false">
              <el-option label="UTF-8" value="utf8" />
              <el-option label="GB2312" value="gb2312" />
              <el-option label="GBK" value="gbk" />
              <el-option label="GB18030" value="gb18030" />
              <el-option label="BIG5" value="big5" />
              <el-option label="Shift-JIS" value="shift-jis" />
              <el-option label="EUC-KR" value="euc-kr" />
              <el-option label="ASCII" value="ascii" />
              <el-option label="ISO-8859-1" value="latin1" />
              <el-option label="ISO-8859-2" value="latin2" />
              <el-option label="KOI8-R" value="koi8-r" />
              <el-option label="windows-1251" value="windows-1251" />
              <el-option label="windows-1252" value="windows-1252" />
              <el-option label="ISO-8859-5" value="iso-8859-5" />
              <el-option label="UTF-16LE" value="utf16le" />
              <el-option label="UTF-16BE" value="utf16be" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">{{ t('comTerminal.dataBits') }}</span>
            <el-select v-model="dataBits" size="small" class="param-select">
              <el-option label="5" :value="5" />
              <el-option label="6" :value="6" />
              <el-option label="7" :value="7" />
              <el-option label="8" :value="8" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">{{ t('comTerminal.parity') }}</span>
            <el-select v-model="parity" size="small" class="param-select">
              <el-option :label="t('comTerminal.none')" value="none" />
              <el-option :label="t('comTerminal.even')" value="even" />
              <el-option :label="t('comTerminal.odd')" value="odd" />
              <el-option label="Mark" value="mark" />
              <el-option label="Space" value="space" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">{{ t('comTerminal.stopBits') }}</span>
            <el-select v-model="stopBits" size="small" class="param-select">
              <el-option label="1" :value="1" />
              <el-option label="1.5" :value="1.5" />
              <el-option label="2" :value="2" />
            </el-select>
            <el-button icon="More" size="small" class="btn-primary more-btn" @click="showMoreDialog = true">
              {{ t('comTerminal.more') }}
            </el-button>
          </div>
        </div>

        <!-- 更多设置对话框 -->
        <el-dialog v-model="showMoreDialog" :title="t('comTerminal.advancedSettings')" width="400px">
          <el-form label-width="100px" @submit.prevent>
            <el-form-item :label="t('comTerminal.openTimeout')">
              <div class="input-with-unit">
                <el-input-number v-model="readTimeout" :min="0" :step="100" size="small" class="full-width" :controls="false" placeholder="ms" />
                <span class="unit-label">ms</span>
              </div>
            </el-form-item>
            <el-form-item :label="t('comTerminal.writeTimeout')">
              <div class="input-with-unit">
                <el-input-number v-model="writeTimeout" :min="0" :step="100" size="small" class="full-width" :controls="false" placeholder="ms" />
                <span class="unit-label">ms</span>
              </div>
            </el-form-item>
            <el-form-item :label="t('comTerminal.flowControl')">
              <el-select v-model="flowControl" size="small" class="full-width">
                <el-option :label="t('comTerminal.none')" value="none" />
                <el-option :label="t('comTerminal.hardware')" value="hardware" />
                <el-option :label="t('comTerminal.software')" value="software" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('comTerminal.dtr')">
              <el-switch class="terminal-switch" v-model="dtr" />
            </el-form-item>
            <el-form-item :label="t('comTerminal.rts')">
              <el-switch class="terminal-switch" v-model="rts" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button class="btn-cancel" size="small" @click="showMoreDialog = false">{{ t('common.close') }}</el-button>
          </template>
        </el-dialog>

        <!-- 新增波特率对话框 -->
        <el-dialog v-model="showAddBaudRateDialog" :title="t('comTerminal.addBaudRateTitle')" width="300px" @opened="onBaudRateDialogOpened">
          <el-form label-width="80px" @submit.prevent>
            <el-form-item :label="t('comTerminal.baudRateLabel')">
              <el-input-number
                ref="baudRateInputRef"
                v-model="newBaudRate"
                :min="1"
                :max="99999999"
                :step="1"
                size="small"
                class="full-width"
                controls-position="right"
                :controls="false"
                :placeholder="t('comTerminal.baudRatePlaceholder')"
                @keyup.enter="addBaudRate"
              />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button class="btn-cancel" style="width: auto !important" size="small" @click="showAddBaudRateDialog = false">{{ t('common.cancel') }}</el-button>
            <el-button size="small" class="btn-primary" style="width: auto !important" @click="addBaudRate">{{ t('common.confirm') }}</el-button>
          </template>
        </el-dialog>
      </template>
    </UnifiedTerminal>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed, watch, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import UnifiedTerminal from './UnifiedTerminal.vue'
import { useTerminal } from '../composables/useTerminal'
import { getDefaultTerminalFont } from '../utils/FontDetector'
import { sendDisplayText, recvDisplayText } from '../composables/app/useSettingsStore'
import type { AiBridgeEvent } from '../../../shared/extensions/ai-control-bridge/AiBridgeEvents'

const { t } = useI18n()

const emit = defineEmits(['onClose', 'commandSent', 'onConnect', 'onDisconnect', 'openCommandEditor', 'remarkUpdated', 'fontLoaded', 'openSyntaxHighlight'])
const props = withDefaults(defineProps<{
  connection: {
    id: string | number
    connectionType: string
    comName?: string
    baudRate?: number
    dataBits?: number
    stopBits?: number
    parity?: string
    name?: string
    host?: string
    port?: number
    username?: string
    password?: string
    sessionId: string | number
    remark?: string
    aiManaged?: boolean
    aiSessionState?: 'starting' | 'connected' | 'error' | 'closed' | 'unknown'
  }
  autoConnect?: boolean
  onClose?: () => void
}>(), {
  autoConnect: true
})

const unifiedTerminalRef = ref<InstanceType<typeof UnifiedTerminal>>()
const isConnected = ref(false)
const isConnecting = ref(false)
const preventAutoReconnect = ref(false)
const showMoreDialog = ref(false)
const showAddBaudRateDialog = ref(false)
const newBaudRate = ref(9600)
const baudRateInputRef = ref<any>(null)

const onBaudRateDialogOpened = () => {
  nextTick(() => {
    const input = baudRateInputRef.value?.$el?.querySelector('input')
    if (input) {
      input.select()
      input.focus()
    }
  })
}

const encoding = ref('utf8')
const readTimeout = ref(0)
const writeTimeout = ref(0)
const flowControl = ref<'none' | 'hardware' | 'software'>('none')
const dtr = ref(false)
const rts = ref(false)
const hexDisplayMode = ref(false)
const autoNewline = ref(true)
const hexMode = ref(false)
const crcEnabled = ref(true)
const crcMethod = ref<string>('CRC-16/MODBUS')
let isApplyingBridgeUpdate = false

let removeMountedCloseListener: (() => void) | null = null
let removeDataListener: (() => void) | null = null
let removeBridgeEventListener: (() => void) | null = null

// 串口参数
const baudRates = ref<number[]>([]) // 从全局设置加载
const baudRate = ref(props.connection.baudRate || 9600)
const dataBits = ref(props.connection.dataBits || 8)
const stopBits = ref(props.connection.stopBits || 1)
const parity = ref(props.connection.parity || 'none')
const remark = ref(props.connection.remark || '')

const isConnectedValue = computed(() => isConnected.value)
const currentSessionId = ref<string>('')
type ExternalSessionState = 'starting' | 'connected' | 'error' | 'closed' | 'unknown'

// 使用通用 composable
const terminal = useTerminal({
  connection: props.connection,
  unifiedTerminalRef,
  isConnected,
  isConnecting,
  connectionType: 'com',
  sendDisplaySuffix: 'SEND>>>>>>>>>>>>>'
})

const { openLogFolder, openLogFile, saveLogFile, cleanup: terminalCleanup } = terminal

// 监听波特率变化
watch(baudRate, (newVal) => {
  if (isApplyingBridgeUpdate) return
  if (newVal === '__add__' as any) {
    showAddBaudRateDialog.value = true
    nextTick(() => {
      if (baudRates.value.length > 0) {
        baudRate.value = baudRates.value[0]
      }
    })
  } else {
    saveComSettings()
    if (isConnected.value) {
      applyComConfig()
    }
  }
})

// 监听串口设置变化，自动保存
watch([dataBits, stopBits, parity, encoding, readTimeout, writeTimeout, flowControl, dtr, rts], () => {
  if (isApplyingBridgeUpdate) return
  saveComSettings()
  if (isConnected.value) {
    applyComConfig()
  }
})

// 监听字体大小变化，仅保存设置（不重连串口）
watch(terminal.fontSize, () => {
  if (isApplyingBridgeUpdate) return
  saveComSettings()
})

// 监听 HEX 显示模式变化
watch(hexDisplayMode, (newVal) => {
  if (isApplyingBridgeUpdate) return
  saveComSettings()
  unifiedTerminalRef.value?.setHexDisplayMode?.(newVal)
  if (isConnected.value) {
    updateReceiveHexMode(newVal)
  }
})

// 监听 CRLF 模式变化
watch(autoNewline, (newVal) => {
  if (isApplyingBridgeUpdate) return
  saveComSettings()
  unifiedTerminalRef.value?.setAutoNewline?.(newVal)
})

// 监听 HEX 发送模式变化
watch(hexMode, (newVal) => {
  if (isApplyingBridgeUpdate) return
  saveComSettings()
  unifiedTerminalRef.value?.setHexMode?.(newVal)
})

// 监听 CRC 启用状态变化
watch(crcEnabled, (newVal) => {
  if (isApplyingBridgeUpdate) return
  saveComSettings()
  unifiedTerminalRef.value?.setCrcEnabled?.(newVal)
})

// 监听 CRC 计算方式变化
watch(crcMethod, (newVal) => {
  if (isApplyingBridgeUpdate) return
  saveComSettings()
  unifiedTerminalRef.value?.setCrcMethod?.(newVal)
})

// 监听 UnifiedTerminal 的状态变化
watch(() => unifiedTerminalRef.value?.getAutoNewline?.(), (newVal) => {
  if (newVal !== undefined && newVal !== autoNewline.value) {
    autoNewline.value = newVal
  }
}, { immediate: true })

watch(() => unifiedTerminalRef.value?.getHexMode?.(), (newVal) => {
  if (newVal !== undefined && newVal !== hexMode.value) {
    hexMode.value = newVal
  }
}, { immediate: true })

watch(() => unifiedTerminalRef.value?.getCrcEnabled?.(), (newVal) => {
  if (newVal !== undefined && newVal !== crcEnabled.value) {
    crcEnabled.value = newVal
  }
}, { immediate: true })

watch(() => unifiedTerminalRef.value?.getCrcMethod?.(), (newVal) => {
  if (newVal !== undefined && newVal !== crcMethod.value) {
    crcMethod.value = newVal
  }
}, { immediate: true })

// 应用串口配置（热更新）
const applyComConfig = async () => {
  try {
    const result = await window.connectApi.updateConnect(
      {
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      },
      {
        baudRate: baudRate.value,
        dataBits: dataBits.value,
        stopBits: stopBits.value,
        parity: parity.value,
        encoding: encoding.value,
        readTimeout: readTimeout.value,
        writeTimeout: writeTimeout.value,
        flowControl: flowControl.value,
        dtr: dtr.value,
        rts: rts.value
      }
    )
    if (!result.success) {
      ElMessage.error(result.message || t('comTerminal.updateConfigFailed'))
    }
  } catch (error) {
    console.error('applyComConfig error:', error)
    ElMessage.error(t('comTerminal.updateConfigFailed2'))
  }
}

// 动态更新 hex/str 接收模式
const updateReceiveHexMode = async (isHex: boolean) => {
  try {
    await window.connectApi.updateConnect(
      {
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      },
      { receiveHex: isHex }
    )
  } catch (error) {
    console.error('updateReceiveHexMode error:', error)
  }
}

// 加载保存的串口设置
const loadComSettings = async () => {
  try {
    if (!props.connection.comName) return
    const settings = await window.storageApi.getComSettings(props.connection.comName)
    if (settings) {
      baudRate.value = settings.baudRate || 9600
      dataBits.value = settings.dataBits || 8
      stopBits.value = settings.stopBits || 1
      parity.value = settings.parity || 'none'
      encoding.value = settings.encoding || 'utf8'
      readTimeout.value = settings.readTimeout || 0
      writeTimeout.value = settings.writeTimeout || 0
      flowControl.value = settings.flowControl || 'none'
      dtr.value = settings.dtr !== undefined ? settings.dtr : false
      rts.value = settings.rts !== undefined ? settings.rts : false
      remark.value = settings.remark || ''
      hexDisplayMode.value = settings.hexDisplayMode || false
      terminal.showTimestamp.value = settings.showTimestamp !== undefined ? settings.showTimestamp : true
      autoNewline.value = settings.autoNewline !== undefined ? settings.autoNewline : true
      hexMode.value = settings.hexMode || false
      crcEnabled.value = settings.crcEnabled !== undefined ? settings.crcEnabled : true
      crcMethod.value = settings.crcMethod || 'CRC-16/MODBUS'
      terminal.fontSize.value = settings.fontSize !== undefined ? settings.fontSize : 14
      terminal.fontFamily.value = settings.fontFamily || getDefaultTerminalFont()
      const savedInput = settings.commandInput || ''

      unifiedTerminalRef.value?.setHexDisplayMode?.(hexDisplayMode.value)
      unifiedTerminalRef.value?.setShowTimestamp?.(terminal.showTimestamp.value)
      unifiedTerminalRef.value?.setAutoNewline?.(autoNewline.value)
      unifiedTerminalRef.value?.setHexMode?.(hexMode.value)
      unifiedTerminalRef.value?.setCrcEnabled?.(crcEnabled.value)
      unifiedTerminalRef.value?.setCrcMethod?.(crcMethod.value)
      unifiedTerminalRef.value?.setFontSize?.(terminal.fontSize.value)
      unifiedTerminalRef.value?.setFontFamily?.(terminal.fontFamily.value)
      unifiedTerminalRef.value?.setCommandInput?.(savedInput)
      emit('fontLoaded', terminal.fontFamily.value)
    }
  } catch (error) {
    console.error(t('comTerminal.loadSettingsFailed'), error)
  }
}

// 保存串口设置
const saveComSettings = async () => {
  try {
    if (!props.connection.comName) return
    const settings = {
      baudRate: baudRate.value,
      dataBits: dataBits.value,
      stopBits: stopBits.value,
      parity: parity.value,
      encoding: encoding.value,
      readTimeout: readTimeout.value,
      writeTimeout: writeTimeout.value,
      flowControl: flowControl.value,
      dtr: dtr.value,
      rts: rts.value,
      remark: remark.value,
      hexDisplayMode: hexDisplayMode.value,
      showTimestamp: terminal.showTimestamp.value,
      autoNewline: autoNewline.value,
      hexMode: hexMode.value,
      crcEnabled: crcEnabled.value,
      crcMethod: crcMethod.value,
      fontSize: terminal.fontSize.value,
      fontFamily: terminal.fontFamily.value,
      commandInput: unifiedTerminalRef.value?.getCommandInput?.() || ''
    }
    await window.storageApi.saveComSettings(props.connection.comName, settings)
  } catch (error) {
    console.error(t('comTerminal.saveSettingsFailed'), error)
  }
}

// 更新备注并通知父组件
const updateRemark = async (newRemark: string) => {
  remark.value = newRemark
  await saveComSettings()
  emit('remarkUpdated', { comName: props.connection.comName, remark: newRemark })
}

// 通知后端更新日志时间戳配置
const notifyLogTimestampToBackend = async (showTs: boolean) => {
  if (!isConnected.value) return
  try {
    await window.connectApi.updateConnect(
      { connectionType: 'com', comName: props.connection.comName, sessionId: props.connection.sessionId },
      { logTimestamp: showTs }
    )
  } catch (error) {
    console.error('Failed to update log timestamp config:', error)
  }
}

// 加载全局波特率列表（从设置中获取 supportedBaudRates）
const loadBaudRates = async () => {
  try {
    const allSettings = await window.storageApi.getSettings()
    baudRates.value = allSettings?.supportedBaudRates || [9600, 19200, 115200, 1500000]
  } catch (error) {
    console.error(t('comTerminal.loadSettingsFailed'), error)
    baudRates.value = [9600, 19200, 115200, 1500000]
  }
}

// 监听设置更新事件（波特率列表变化）
const handleSettingsUpdated = (event: Event) => {
  const settings = (event as CustomEvent).detail
  if (settings && 'supportedBaudRates' in settings) {
    baudRates.value = settings.supportedBaudRates || baudRates.value
    // 如果当前选中的波特率不在列表中，切换到第一个
    if (!baudRates.value.includes(baudRate.value)) {
      baudRate.value = baudRates.value[0]
    }
  }
}

const bindDataListener = (): void => {
  currentSessionId.value = String(props.connection.sessionId)
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  removeDataListener = window.connectApi.onRecvData((data) => {
    if (String(data.connId) !== String(currentSessionId.value)) return
    terminal.totalRxSize += data.data.length
    unifiedTerminalRef.value?.updateRxBytes(data.data.length)
    const prefix = terminal.showTimestamp.value && data.timestamp ? `[${data.timestamp}] ` : ''
    const recvLabel = recvDisplayText.value ? `${recvDisplayText.value} ` : ''
    const displayText = `${prefix}${recvLabel}${data.data}\n`
    unifiedTerminalRef.value?.appendToTerminal(displayText)
  })
}

const appendExternalSessionState = (state: ExternalSessionState, result?: unknown): void => {
  const message =
    result &&
    typeof result === 'object' &&
    typeof (result as { message?: unknown }).message === 'string'
      ? `: ${(result as { message: string }).message}`
      : ''
  if (state === 'connected') {
    unifiedTerminalRef.value?.appendToTerminal(`\n[AI] ${t('comTerminal.connectSuccess')}\n`)
  } else if (state === 'starting') {
    unifiedTerminalRef.value?.appendToTerminal(
      `\n[AI] ${t('comTerminal.connecting', { port: props.connection.comName })}\n`
    )
  } else if (state === 'error') {
    unifiedTerminalRef.value?.appendToTerminal(
      `\n[AI] ${t('comTerminal.connectFailed')}${message}\n`
    )
  } else if (state === 'closed') {
    unifiedTerminalRef.value?.appendToTerminal(`\n[AI] ${t('comTerminal.connectionClosed')}\n`)
  }
}

const applyExternalSessionState = (
  state: ExternalSessionState | undefined,
  result?: unknown
): void => {
  if (!props.connection.aiManaged || !state) return
  if (state === 'starting') {
    isConnecting.value = true
    isConnected.value = false
    appendExternalSessionState(state, result)
    return
  }
  if (state === 'connected') {
    const wasConnected = isConnected.value
    isConnecting.value = false
    isConnected.value = true
    bindDataListener()
    if (!wasConnected) appendExternalSessionState(state, result)
    emit('onConnect', props.connection.sessionId)
    return
  }

  const wasConnected = isConnected.value
  isConnecting.value = false
  isConnected.value = false
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (state === 'error' || (state === 'closed' && wasConnected))
    appendExternalSessionState(state, result)
  if (wasConnected || state === 'error' || state === 'closed')
    emit('onDisconnect', props.connection.sessionId)
}

watch(
  () => props.connection.aiSessionState,
  (state, previousState) => {
    if (props.connection.aiManaged && state !== previousState) {
      applyExternalSessionState(state)
    }
  }
)

const formatBridgeTimestamp = (timestamp?: string): string => {
  const parsed = timestamp ? new Date(timestamp) : new Date()
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`
}

const formatAiCommand = (command: string, displayCommand?: unknown): string => {
  if (typeof displayCommand === 'string') return displayCommand
  if (hexMode.value) {
    return Array.from(command)
      .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase())
      .join(' ')
  }
  return command.replace(/(?:\r\n|\r|\n)+$/, '')
}

const appendAiTxEvent = (event: AiBridgeEvent): boolean => {
  if (
    (event?.eventType !== 'tx.accepted' && event?.eventType !== 'tx.failed') ||
    event?.source !== 'ai' ||
    String(event?.sessionId) !== String(props.connection.sessionId)
  )
    return false

  const payload = event.payload || {}
  const command = typeof payload.command === 'string' ? payload.command : ''
  if (!command) return true

  const displayCommand = formatAiCommand(command, payload.displayCommand)
  const failed = event.eventType === 'tx.failed'
  const result = payload.result as { message?: unknown } | undefined
  const errorSuffix = failed && typeof result?.message === 'string' ? ` (${result.message})` : ''
  const label = failed ? `AI ${sendDisplayText.value} FAILED` : `AI ${sendDisplayText.value}`
  unifiedTerminalRef.value?.appendToTerminal(
    `\n[${formatBridgeTimestamp(event.timestamp)}] ${label} ${displayCommand}${errorSuffix}\n`
  )

  if (!failed) {
    const byteLength = typeof payload.byteLength === 'number' ? payload.byteLength : command.length
    unifiedTerminalRef.value?.updateTxBytes(byteLength)
  }
  return true
}

// AI 或其他 GUI 通过主进程修改当前 COM 会话后，应用同一份运行时 patch。
const appendExternalSessionEvent = (event: AiBridgeEvent): boolean => {
  if (
    !props.connection.aiManaged ||
    (event?.eventType !== 'session.state' && event?.eventType !== 'session.closed') ||
    (event?.source !== 'ai' && event?.source !== 'system') ||
    String(event?.sessionId) !== String(props.connection.sessionId)
  )
    return false

  const payload = event.payload || {}
  const state =
    event.eventType === 'session.closed' ? 'closed' : (payload.state as ExternalSessionState)
  applyExternalSessionState(state, payload.result)
  return true
}

const handleBridgeEvent = (event: AiBridgeEvent): void => {
  if (appendExternalSessionEvent(event)) return
  if (appendAiTxEvent(event)) return

  const isSessionEvent =
    event?.eventType === 'session.config.changed' &&
    String(event.sessionId) === String(props.connection.sessionId)
  const isConfigEvent =
    event?.eventType === 'config.changed' &&
    event.payload?.domain === 'com-settings' &&
    String(event.payload?.targetId) === String(props.connection.comName)
  if (!isSessionEvent && !isConfigEvent) return

  const changed = event.payload?.changed
  if (!changed || typeof changed !== 'object' || Array.isArray(changed)) return
  const values = changed as Record<string, unknown>
  isApplyingBridgeUpdate = true
  if (typeof values.baudRate === 'number') baudRate.value = values.baudRate
  if (typeof values.dataBits === 'number') dataBits.value = values.dataBits
  if (typeof values.stopBits === 'number') stopBits.value = values.stopBits
  if (typeof values.parity === 'string') parity.value = values.parity
  if (typeof values.encoding === 'string') encoding.value = values.encoding
  if (typeof values.readTimeout === 'number') readTimeout.value = values.readTimeout
  if (typeof values.writeTimeout === 'number') writeTimeout.value = values.writeTimeout
  if (
    values.flowControl === 'none' ||
    values.flowControl === 'hardware' ||
    values.flowControl === 'software'
  ) {
    flowControl.value = values.flowControl
  }
  if (typeof values.dtr === 'boolean') dtr.value = values.dtr
  if (typeof values.rts === 'boolean') rts.value = values.rts
  if (typeof values.hexDisplayMode === 'boolean') {
    hexDisplayMode.value = values.hexDisplayMode
    unifiedTerminalRef.value?.setHexDisplayMode?.(hexDisplayMode.value)
    if (isConnected.value) void updateReceiveHexMode(hexDisplayMode.value)
  }
  if (typeof values.showTimestamp === 'boolean') {
    terminal.showTimestamp.value = values.showTimestamp
    unifiedTerminalRef.value?.setShowTimestamp?.(terminal.showTimestamp.value)
    if (isConnected.value) void notifyLogTimestampToBackend(terminal.showTimestamp.value)
  }
  if (typeof values.autoNewline === 'boolean') {
    autoNewline.value = values.autoNewline
    unifiedTerminalRef.value?.setAutoNewline?.(autoNewline.value)
  }
  if (typeof values.hexMode === 'boolean') {
    hexMode.value = values.hexMode
    unifiedTerminalRef.value?.setHexMode?.(hexMode.value)
  }
  if (typeof values.crcEnabled === 'boolean') {
    crcEnabled.value = values.crcEnabled
    unifiedTerminalRef.value?.setCrcEnabled?.(crcEnabled.value)
  }
  if (typeof values.crcMethod === 'string') {
    crcMethod.value = values.crcMethod
    unifiedTerminalRef.value?.setCrcMethod?.(crcMethod.value)
  }
  if (values.commandInput !== undefined) {
    unifiedTerminalRef.value?.setCommandInput?.(String(values.commandInput ?? ''))
  }
  nextTick(() => {
    isApplyingBridgeUpdate = false
  })
}

// 新增波特率（更新全局设置）
const addBaudRate = async () => {
  const rate = newBaudRate.value
  if (rate && !baudRates.value.includes(rate)) {
    baudRates.value.push(rate)
    baudRates.value.sort((a, b) => a - b)
    baudRate.value = rate
    // 更新全局设置（统一使用 supportedBaudRates）
    try {
      const allSettings = await window.storageApi.getSettings()
      allSettings.supportedBaudRates = [...baudRates.value]
      await window.storageApi.saveSettings(allSettings)
      window.dispatchEvent(new CustomEvent('settings-updated', { detail: allSettings }))
    } catch (error) {
      console.error('saveBaudRates error:', error)
    }
  } else if (baudRates.value.includes(rate)) {
    ElMessage.warning(t('serialSettings.rateExists'))
    baudRate.value = rate
  }
  showAddBaudRateDialog.value = false
}

// 删除波特率（更新全局设置）
const deleteBaudRate = async (rate: number) => {
  if (baudRates.value.length <= 1) {
    ElMessage.warning(t('serialSettings.atLeastOneRate'))
    return
  }
  const index = baudRates.value.indexOf(rate)
  if (index > -1) {
    baudRates.value.splice(index, 1)
    if (baudRate.value === rate) {
      baudRate.value = baudRates.value[0]
    }
    // 更新全局设置（统一使用 supportedBaudRates）
    try {
      const allSettings = await window.storageApi.getSettings()
      allSettings.supportedBaudRates = [...baudRates.value]
      await window.storageApi.saveSettings(allSettings)
      window.dispatchEvent(new CustomEvent('settings-updated', { detail: allSettings }))
    } catch (error) {
      console.error('saveBaudRates error:', error)
    }
  }
}

const handleConnect = async () => {
  isConnecting.value = true
  unifiedTerminalRef.value?.appendToTerminal(`\n${t('comTerminal.connecting', { port: props.connection.comName })}\n`)

  try {
    const result = await window.connectApi.startConnect({
      connectionType: 'com',
      comName: props.connection.comName,
      baudRate: baudRate.value,
      dataBits: dataBits.value,
      stopBits: stopBits.value,
      parity: parity.value,
      name: props.connection.name,
      sessionId: props.connection.sessionId,
      encoding: encoding.value,
      readTimeout: readTimeout.value,
      writeTimeout: writeTimeout.value,
      receiveHex: hexDisplayMode.value
    })

    if (result.success) {
      currentSessionId.value = String(props.connection.sessionId)
      isConnected.value = true
      isConnecting.value = false
      unifiedTerminalRef.value?.appendToTerminal(`\n${t('comTerminal.connectSuccess')}\n`)
      emit('onConnect', props.connection.sessionId)

      notifyLogTimestampToBackend(terminal.showTimestamp.value)

      // 清理旧的数据监听器，防止重复注册
      bindDataListener()

      unifiedTerminalRef.value?.focusInput()
    } else {
      const err = new Error(result.message || t('comTerminal.connectFailed')) as Error & { code?: string }
      err.code = result.code
      throw err
    }
  } catch (error) {
    isConnecting.value = false
    const err = error as Error & { code?: string }
    unifiedTerminalRef.value?.appendToTerminal(`\n${t('comTerminal.connectFailed')}: ${err.message}\n`)
    ElMessage.error(t('comTerminal.connectFailed'))
    // Linux 串口权限不足：提供一键修复入口（pkexec 写入 udev 规则）
    if (err.code === 'EACCES') {
      offerSerialPermissionFix()
    }
  }
}

// Linux 串口权限不足时，提供一键修复（AppImage 等无安装钩子的包格式依赖此路径）
const offerSerialPermissionFix = async () => {
  try {
    await ElMessageBox.confirm(t('comTerminal.fixPermissionConfirm'), t('comTerminal.fixPermissionTitle'), {
      confirmButtonText: t('comTerminal.fixPermissionBtn'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      center: true
    })
  } catch {
    return // 用户取消
  }
  const result = await window.connectApi.fixSerialPermissions()
  if (result.success) {
    ElMessage.success(t('comTerminal.fixPermissionSuccess'))
    unifiedTerminalRef.value?.appendToTerminal(`\n${t('comTerminal.fixPermissionSuccess')}\n`)
  } else {
    ElMessage.error(result.message || t('comTerminal.fixPermissionFailed'))
  }
}

const handleClose = async () => {
  preventAutoReconnect.value = true
  terminalCleanup()
  // 清理数据监听器
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  // 移除断开监听器，防止主动断开时触发 onConnectClose 回调
  if (removeMountedCloseListener) {
    removeMountedCloseListener()
    removeMountedCloseListener = null
  }
  unifiedTerminalRef.value?.appendToTerminal(`\n${t('comTerminal.connectionClosed')}\n`)
  try {
    await window.connectApi.stopConnect({
      connectionType: 'com',
      comName: props.connection.comName,
      sessionId: props.connection.sessionId
    })
  } catch (error) {
    console.error(t('comTerminal.connectionClosed'), error)
  }
  isConnected.value = false
  emit('onDisconnect', props.connection.sessionId)
}

const handleSendCommand = async (command: string, originalInput?: string) => {
  if (!command.trim() || !isConnected.value) return

  // HEX 模式下将实际发送的二进制数据转成 HEX 显示（包含 CRLF 和 CRC 字节）
  let displayCommand: string
  if (hexMode.value) {
    const hexBytes: string[] = []
    for (let i = 0; i < command.length; i++) {
      hexBytes.push(command.charCodeAt(i).toString(16).padStart(2, '0').toUpperCase())
    }
    displayCommand = hexBytes.join(' ')
  } else {
    displayCommand = originalInput || command
  }
  terminal.totalTxSize += command.length
  unifiedTerminalRef.value?.updateTxBytes(command.length)

  // 显示发送内容
  const now = new Date()
  const timestamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}.${String(now.getMilliseconds()).padStart(3, '0')}`
  unifiedTerminalRef.value?.appendToTerminal(`\n[${timestamp}] ${sendDisplayText.value} ${displayCommand}\n`)

  try {
    await window.connectApi.sendData({
      conn: {
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      },
      command: command
    })
    // 发送成功后保存当前输入栏内容
    saveComSettings()
  } catch (error) {
    ElMessage.error(t('comTerminal.commandSendFailed'))
    console.error(t('comTerminal.commandSendFailed'), error)
  }
}


const saveLog = async () => {
  await saveLogFile()
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const refreshGroupsCmds = () => unifiedTerminalRef.value?.refreshGroupsCmds?.()

const reconnect = () => {
  terminal.totalRxSize = 0
  terminal.totalTxSize = 0
  unifiedTerminalRef.value?.resetRxTx()
  if (!isConnected.value && !isConnecting.value) {
    handleConnect()
  }
}

const handleFontChange = (font: string) => {
  terminal.handleFontChange(font)
  saveComSettings()
}

defineExpose({
  refreshGroupsCmds,
  reconnect,
  disconnect: handleClose,
  isConnected: isConnectedValue,
  preventAutoReconnect: () => { preventAutoReconnect.value = true },
  getRemark: () => remark.value,
  updateRemark,
  handleFontChange,
  getFontFamily: () => {
    const unifiedFont = unifiedTerminalRef.value?.getFontFamily?.()
    return unifiedFont || terminal.fontFamily.value
  },
  clearTerminal: () => unifiedTerminalRef.value?.clearTerminal?.(),
  setWordWrap: (val: boolean) => unifiedTerminalRef.value?.setWordWrap?.(val),
  setLineNumbers: (val: boolean) => unifiedTerminalRef.value?.setLineNumbers?.(val),
  setLogEditable: (val: boolean) => unifiedTerminalRef.value?.setLogEditable?.(val)
})

onMounted(async () => {
  preventAutoReconnect.value = false
  await loadBaudRates()
  await loadComSettings()

  nextTick(() => {
    unifiedTerminalRef.value?.setHexDisplayMode?.(hexDisplayMode.value)
    unifiedTerminalRef.value?.setShowTimestamp?.(terminal.showTimestamp.value)
    unifiedTerminalRef.value?.setAutoNewline?.(autoNewline.value)
    unifiedTerminalRef.value?.setHexMode?.(hexMode.value)
    unifiedTerminalRef.value?.setCrcEnabled?.(crcEnabled.value)
    unifiedTerminalRef.value?.setCrcMethod?.(crcMethod.value)
  })

  if (removeMountedCloseListener) removeMountedCloseListener()
  removeMountedCloseListener = window.connectApi.onConnectClose((sessionId: number | string) => {
    if (String(sessionId) === String(props.connection.sessionId)) {
      if (preventAutoReconnect.value) return
      isConnected.value = false
      unifiedTerminalRef.value?.appendToTerminal(`\n${t('comTerminal.disconnected')}\n`)
      emit('onDisconnect', sessionId)
    }
  })

  // 监听设置更新事件（波特率列表变化时刷新）
  window.addEventListener('settings-updated', handleSettingsUpdated)
  removeBridgeEventListener = window.connectApi.onBridgeEvent(handleBridgeEvent)

  if (props.connection.aiManaged) {
    applyExternalSessionState(props.connection.aiSessionState)
  } else if (props.autoConnect) {
    handleConnect()
  }
})

onUnmounted(() => {
  terminalCleanup()
  window.removeEventListener('settings-updated', handleSettingsUpdated)
  removeBridgeEventListener?.()
  removeBridgeEventListener = null
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeMountedCloseListener) {
    removeMountedCloseListener()
    removeMountedCloseListener = null
  }

  if (isConnected.value) {
    window.connectApi
      .stopConnect({
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      })
      .catch((err) => {
        console.error(t('comTerminal.connectionClosed'), err)
      })
  }
})
</script>

<style scoped>
.com-terminal {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  background: var(--com-terminal-bg);
  color: var(--com-terminal-color);
  font-family: 'Fira Code', 'Consolas', 'Ubuntu Mono', 'Noto Sans Mono CJK SC', monospace;
  overflow: hidden;
}

.param-row {
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
  padding: 8px 8px 8px 0px;
  background-color: var(--com-param-row-bg);
  border-bottom: 1px solid var(--com-param-row-border);
  border-radius: 6px;
  margin: 2px 4px;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label {
  font-size: 12px;
  color: var(--com-param-label);
  white-space: nowrap;
}

.param-select {
  width: 80px;
}

.param-select-baud {
  width: 120px;
}

:deep(.param-row .el-select.param-select .el-select__wrapper) {
  height: 26px !important;
  min-height: 26px !important;
}

:deep(.param-row .el-select.param-select .el-select__caret) {
  line-height: 26px !important;
}

:deep(.param-row .el-select.param-select-baud .el-select__wrapper) {
  height: 26px !important;
  min-height: 26px !important;
}

:deep(.param-row .el-select.param-select-baud .el-select__caret) {
  line-height: 26px !important;
}

:deep(.param-row .el-select.param-select-encoding .el-select__wrapper) {
  height: 26px !important;
  min-height: 26px !important;
}

.param-select-encoding {
  width: 110px;
}

.input-with-unit {
  display: flex;
  align-items: center;
  width: 100%;
}

.input-with-unit .el-input-number {
  flex: 1;
}

.unit-label {
  margin-left: 8px;
  color: var(--com-unit-label);
  font-size: 12px;
  white-space: nowrap;
}

.baud-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.delete-icon {
  font-size: 12px;
  color: var(--com-unit-label);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.baud-option:hover .delete-icon {
  opacity: 1;
}

.delete-icon:hover {
  color: var(--com-delete-icon-hover);
}

.more-btn {
  margin-left: auto;
  width: 90px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
}

.more-btn:hover {
  transform: translateY(-1px);
}

/* 下拉框和输入框边框样式 */
:deep(.el-select .el-select__wrapper) {
  border: 1px solid var(--border-input) !important;
  background-color: var(--divider-dark) !important;
  box-shadow: none !important;
}

:deep(.el-select .el-select__wrapper:hover),
:deep(.el-select .el-select__wrapper:focus-within),
:deep(.el-select.is-focused .el-select__wrapper) {
  border-color: var(--focus-border-color) !important;
  box-shadow: 0 0 0 1px var(--focus-border-color) inset !important;
}

:deep(.el-input__wrapper) {
  background-color: var(--divider-dark) !important;
  box-shadow: 0 0 0 1px var(--border-input) inset !important;
}

:deep(.el-input__wrapper:hover),
:deep(.el-input__wrapper:focus-within) {
  box-shadow: 0 0 0 1px var(--focus-border-color) inset !important;
}

:deep(.el-input__inner) {
  color: var(--text-secondary) !important;
}
</style>
