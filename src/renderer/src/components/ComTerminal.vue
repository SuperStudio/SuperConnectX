<template>
  <div class="com-terminal">
    <UnifiedTerminal
      ref="unifiedTerminalRef"
      :connection="connection"
      :is-connected="isConnected"
      :is-connecting="isConnecting"
      :init-message="`等待连接 ${connection.comName}...`"
      placeholder="输入命令并按回车发送..."
      session-id-prefix="com"
      @on-close="handleClose"
      @on-reconnect="reconnect"
      @on-open-log="openLogFolder"
      @on-save-log="saveLog"
      @on-send="handleSendCommand"
      @on-command-sent="handleCommandSent"
    >
      <!-- 波特率等设置放到下面 -->
      <template #extra>
        <div class="param-row">
          <div class="param-item">
            <span class="param-label">波特率</span>
            <el-select v-model="baudRate" size="small" class="param-select">
              <el-option v-for="br in baudRates" :key="br" :label="br" :value="br" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">数据位</span>
            <el-select v-model="dataBits" size="small" class="param-select">
              <el-option label="5" :value="5" />
              <el-option label="6" :value="6" />
              <el-option label="7" :value="7" />
              <el-option label="8" :value="8" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">校验位</span>
            <el-select v-model="parity" size="small" class="param-select">
              <el-option label="无" value="none" />
              <el-option label="偶校验" value="even" />
              <el-option label="奇校验" value="odd" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">停止位</span>
            <el-select v-model="stopBits" size="small" class="param-select">
              <el-option label="1" :value="1" />
              <el-option label="2" :value="2" />
            </el-select>
          </div>

          <el-button icon="More" size="small" class="more-btn" @click="showMoreDialog = true">
            更多
          </el-button>
        </div>

        <!-- 更多设置对话框 -->
        <el-dialog v-model="showMoreDialog" title="串口高级设置" width="400px">
          <el-form label-width="100px">
            <el-form-item label="编码">
              <el-select v-model="encoding" size="small" class="full-width">
                <el-option label="UTF-8" value="utf8" />
                <el-option label="GB2312" value="gb2312" />
                <el-option label="GBK" value="gbk" />
                <el-option label="ASCII" value="ascii" />
                <el-option label="ISO-8859-1" value="latin1" />
              </el-select>
            </el-form-item>
            <el-form-item label="读超时(ms)">
              <el-input-number v-model="readTimeout" :min="0" :step="100" size="small" class="full-width" controls-position="right" />
            </el-form-item>
            <el-form-item label="写超时(ms)">
              <el-input-number v-model="writeTimeout" :min="0" :step="100" size="small" class="full-width" controls-position="right" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button v-if="isConnected" type="primary" size="small" @click="saveAndReconnect">保存并重连</el-button>
            <el-button size="small" @click="showMoreDialog = false">{{ isConnected ? '取消' : '关闭' }}</el-button>
          </template>
        </el-dialog>
      </template>
    </UnifiedTerminal>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed } from 'vue'
import { ElMessage } from 'element-plus'
import UnifiedTerminal from './UnifiedTerminal.vue'

const emit = defineEmits(['onClose', 'commandSent', 'onConnect', 'onDisconnect'])
const props = withDefaults(defineProps<{
  connection: {
    id: number
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
    sessionId: string
  }
  autoConnect?: boolean
  onClose?: () => void
}>(), {
  autoConnect: true
})

const unifiedTerminalRef = ref<InstanceType<typeof UnifiedTerminal>>()
const isConnected = ref(false)
const isConnecting = ref(false)
const showMoreDialog = ref(false)
const encoding = ref('utf8')
const readTimeout = ref(0)
const writeTimeout = ref(0)
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null
let totalRxSize = 0
let totalTxSize = 0

// 串口参数
const baudRates = [300, 1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200, 230400, 460800, 921600]
const baudRate = ref(props.connection.baudRate || 9600)
const dataBits = ref(props.connection.dataBits || 8)
const stopBits = ref(props.connection.stopBits || 1)
const parity = ref(props.connection.parity || 'none')

const isConnectedValue = computed(() => isConnected.value)
const currentSessionId = ref<string>('')

const handleConnect = async () => {
  isConnecting.value = true
  unifiedTerminalRef.value?.appendToTerminal(`\n正在连接 ${props.connection.comName}...\n`)

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
      writeTimeout: writeTimeout.value
    })

    if (result.success) {
      currentSessionId.value = props.connection.sessionId
      isConnected.value = true
      isConnecting.value = false
      unifiedTerminalRef.value?.appendToTerminal(`\n连接成功!\n`)
      emit('onConnect', props.connection.sessionId)

      // 注册数据监听
      if (removeDataListener) removeDataListener()
      removeDataListener = window.connectApi.onRecvData((data) => {
        if (String(data.connId) !== String(currentSessionId.value)) return
        totalRxSize += data.data.length
        unifiedTerminalRef.value?.updateRxBytes(data.data.length)
        unifiedTerminalRef.value?.appendToTerminal(`\n${data.data}`)
      })

      if (removeCloseListener) removeCloseListener()
      removeCloseListener = window.connectApi.onConnectClose(() => {
        handleClose()
      })

      unifiedTerminalRef.value?.focusInput()
    } else {
      throw new Error(result.message || '连接失败')
    }
  } catch (error) {
    isConnecting.value = false
    unifiedTerminalRef.value?.appendToTerminal(`\n连接失败: ${(error as Error).message}\n`)
    ElMessage.error('连接失败')
  }
}

const handleClose = async () => {
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeCloseListener) {
    removeCloseListener()
    removeCloseListener = null
  }

  try {
    await window.connectApi.stopConnect({
      connectionType: 'com',
      comName: props.connection.comName,
      sessionId: props.connection.sessionId
    })
  } catch (error) {
    console.error('关闭连接失败:', error)
  }

  isConnected.value = false
  unifiedTerminalRef.value?.appendToTerminal(`\n连接已关闭\n`)
  emit('onDisconnect', props.connection.sessionId)
}

const handleSendCommand = async (command: string) => {
  if (!command.trim() || !isConnected.value) return

  unifiedTerminalRef.value?.appendToTerminal(`\n[TX] ${command}\n`)
  totalTxSize += command.length
  unifiedTerminalRef.value?.updateTxBytes(command.length)

  try {
    await window.connectApi.sendData({
      conn: {
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      },
      command: command
    })
  } catch (error) {
    ElMessage.error('命令发送失败')
    console.error('发送失败:', error)
  }
}

const openLogFolder = async () => {
  try {
    await window.connectApi.openConnectLog(props.connection.sessionId)
  } catch (error) {
    ElMessage.error('打开日志文件夹失败')
  }
}

const saveLog = async () => {
  const content = unifiedTerminalRef.value?.getEditorContent() || ''
  try {
    const result = await window.dialogApi.saveFileDialog({
      title: '保存日志',
      defaultPath: `com_${props.connection.comName}_${Date.now()}.log`,
      filters: [{ name: '日志文件', extensions: ['log', 'txt'] }]
    })
    if (result.filePath) {
      await window.toolApi.writeFile({
        path: result.filePath,
        content: content
      })
      ElMessage.success('日志保存成功')
    }
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const refreshGroupsCmds = () => unifiedTerminalRef.value?.refreshGroupsCmds?.()

const reconnect = () => {
  if (!isConnected.value && !isConnecting.value) {
    handleConnect()
  }
}

const saveAndReconnect = () => {
  showMoreDialog.value = false
  handleClose()
  setTimeout(() => {
    handleConnect()
  }, 300)
}

defineExpose({
  refreshGroupsCmds,
  reconnect,
  isConnected: isConnectedValue
})

onMounted(() => {
  // 监听连接关闭事件，更新连接状态（无论从哪里断开）
  window.connectApi.onConnectClose((sessionId: number | string) => {
    if (String(sessionId) === String(props.connection.sessionId)) {
      isConnected.value = false
      unifiedTerminalRef.value?.appendToTerminal(`\n连接已断开\n`)
      emit('onDisconnect', sessionId)
    }
  })

  if (props.autoConnect) {
    handleConnect()
  }
})

onUnmounted(() => {
  if (removeDataListener) {
    removeDataListener()
    removeDataListener = null
  }
  if (removeCloseListener) {
    removeCloseListener()
    removeCloseListener = null
  }

  if (isConnected.value) {
    window.connectApi
      .stopConnect({
        connectionType: 'com',
        comName: props.connection.comName,
        sessionId: props.connection.sessionId
      })
      .catch((err) => {
        console.error('卸载时断开失败:', err)
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
  background: #1e1e1e;
  color: #fff;
  font-family: 'Fira Code', 'Consolas', monospace;
  overflow: hidden;
}

.param-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 8px 12px;
  background-color: #2d2d2d;
  border-bottom: 1px solid #333;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-label {
  font-size: 12px;
  color: #aaa;
  white-space: nowrap;
}

.param-select {
  width: 100px;
}

.more-btn {
  margin-left: auto;
  background-color: #3a3a3a !important;
  border-color: #444 !important;
  color: #e0e0e0 !important;
}

/* 下拉框和输入框边框样式 */
:deep(.el-select .el-select__wrapper) {
  border: 1px solid #4a4a4a !important;
  background-color: #3a3a3a !important;
  box-shadow: none !important;
}

:deep(.el-select .el-select__wrapper:hover),
:deep(.el-select .el-select__wrapper:focus-within),
:deep(.el-select.is-focused .el-select__wrapper) {
  border-color: #007fd4 !important;
  box-shadow: 0 0 0 1px #007fd4 inset !important;
}

:deep(.el-input__wrapper) {
  background-color: #3a3a3a !important;
  box-shadow: 0 0 0 1px #4a4a4a inset !important;
}

:deep(.el-input__wrapper:hover),
:deep(.el-input__wrapper:focus-within) {
  box-shadow: 0 0 0 1px #007fd4 inset !important;
}

:deep(.el-input__inner) {
  color: #e0e0e0 !important;
}
</style>
