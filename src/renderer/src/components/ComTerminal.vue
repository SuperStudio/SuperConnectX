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
      @on-open-command-editor="emit('openCommandEditor', connection.connectionType)"
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
            class="terminal-switch"
          />
          <div class="param-item">
            <span class="param-label">波特率</span>
            <el-select v-model="baudRate" size="small" class="param-select" :popper-append-to-body="false">
              <el-option label="新增..." value="__add__" />
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
              <el-option label="Mark" value="mark" />
              <el-option label="Space" value="space" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">停止位</span>
            <el-select v-model="stopBits" size="small" class="param-select">
              <el-option label="1" :value="1" />
              <el-option label="1.5" :value="1.5" />
              <el-option label="2" :value="2" />
            </el-select>
          </div>

          <div class="param-item">
            <span class="param-label">编码</span>
            <el-select v-model="encoding" size="small" class="param-select-encoding">
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
            <el-button type="primary" icon="More" size="small" class="more-btn" @click="showMoreDialog = true">
              更多
            </el-button>
          </div>
        </div>

        <!-- 更多设置对话框 -->
        <el-dialog v-model="showMoreDialog" title="串口高级设置" width="400px">
          <el-form label-width="100px">
            <el-form-item label="打开超时">
              <div class="input-with-unit">
                <el-input-number v-model="readTimeout" :min="0" :step="100" size="small" class="full-width" :controls="false" placeholder="ms" />
                <span class="unit-label">ms</span>
              </div>
            </el-form-item>
            <el-form-item label="写超时">
              <div class="input-with-unit">
                <el-input-number v-model="writeTimeout" :min="0" :step="100" size="small" class="full-width" :controls="false" placeholder="ms" />
                <span class="unit-label">ms</span>
              </div>
            </el-form-item>
            <el-form-item label="流控制">
              <el-select v-model="flowControl" size="small" class="full-width">
                <el-option label="无" value="none" />
                <el-option label="硬件(RTS/CTS)" value="hardware" />
                <el-option label="软件(XON/XOFF)" value="software" />
              </el-select>
            </el-form-item>
            <el-form-item label="DTR初始">
              <el-switch v-model="dtr" />
            </el-form-item>
            <el-form-item label="RTS初始">
              <el-switch v-model="rts" />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button size="small" @click="showMoreDialog = false">关闭</el-button>
          </template>
        </el-dialog>

        <!-- 新增波特率对话框 -->
        <el-dialog v-model="showAddBaudRateDialog" title="新增波特率" width="300px" @opened="onBaudRateDialogOpened">
          <el-form label-width="80px">
            <el-form-item label="波特率">
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
                placeholder="输入波特率"
              />
            </el-form-item>
          </el-form>
          <template #footer>
            <el-button size="small" @click="showAddBaudRateDialog = false">取消</el-button>
            <el-button size="small" type="primary" @click="addBaudRate">确定</el-button>
          </template>
        </el-dialog>
      </template>
    </UnifiedTerminal>
  </div>
</template>

<script setup lang="ts">
import { ref, onUnmounted, onMounted, computed, watch, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import UnifiedTerminal from './UnifiedTerminal.vue'

const emit = defineEmits(['onClose', 'commandSent', 'onConnect', 'onDisconnect', 'openCommandEditor', 'remarkUpdated'])
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
    remark?: string
  }
  autoConnect?: boolean
  onClose?: () => void
}>(), {
  autoConnect: true
})

const unifiedTerminalRef = ref<InstanceType<typeof UnifiedTerminal>>()
const isConnected = ref(false)
const isConnecting = ref(false)
const preventAutoReconnect = ref(false) // 主动断开时禁止自动重连
const showMoreDialog = ref(false)
const showAddBaudRateDialog = ref(false)
const newBaudRate = ref(9600)
const baudRateInputRef = ref<any>(null)

const onBaudRateDialogOpened = () => {
  // 弹窗打开时，选中输入框内容
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
const hexDisplayMode = ref(false) // HEX显示模式
const autoNewline = ref(true) // 是否自动添加回车换行
const hexMode = ref(false) // 是否为HEX发送模式
let removeDataListener: (() => void) | null = null
let removeCloseListener: (() => void) | null = null
let removeMountedCloseListener: (() => void) | null = null
let totalRxSize = 0
let totalTxSize = 0

// 串口参数
const baudRates = ref<number[]>([])
const baudRate = ref(props.connection.baudRate || 9600)
const dataBits = ref(props.connection.dataBits || 8)
const stopBits = ref(props.connection.stopBits || 1)
const parity = ref(props.connection.parity || 'none')
const remark = ref(props.connection.remark || '')

const isConnectedValue = computed(() => isConnected.value)
const currentSessionId = ref<string>('')

// 监听波特率变化
watch(baudRate, (newVal) => {
  console.log('baudRate watch triggered, newVal:', newVal)
  if (newVal === '__add__' as any) {
    console.log('Showing add dialog')
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
  saveComSettings()
  // 如果已连接，立即应用新配置
  if (isConnected.value) {
    applyComConfig()
  }
})

// 监听 HEX 显示模式变化
watch(hexDisplayMode, (newVal) => {
  saveComSettings()
  unifiedTerminalRef.value?.setHexDisplayMode?.(newVal)
})

// 监听 CRLF 模式变化 - 同步到 UnifiedTerminal 并保存
watch(autoNewline, (newVal) => {
  saveComSettings()
  unifiedTerminalRef.value?.setAutoNewline?.(newVal)
}, { immediate: false })

// 监听 HEX 发送模式变化 - 同步到 UnifiedTerminal 并保存
watch(hexMode, (newVal) => {
  saveComSettings()
  unifiedTerminalRef.value?.setHexMode?.(newVal)
}, { immediate: false })

// 监听 UnifiedTerminal 的 autoNewline 变化，反向同步
watch(() => unifiedTerminalRef.value?.getAutoNewline?.(), (newVal) => {
  if (newVal !== undefined && newVal !== autoNewline.value) {
    autoNewline.value = newVal
  }
}, { immediate: true })

// 监听 UnifiedTerminal 的 hexMode 变化，反向同步
watch(() => unifiedTerminalRef.value?.getHexMode?.(), (newVal) => {
  if (newVal !== undefined && newVal !== hexMode.value) {
    hexMode.value = newVal
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
      ElMessage.error(result.message || '更新配置失败')
    }
  } catch (error) {
    console.error('applyComConfig error:', error)
    ElMessage.error('更新串口配置失败')
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
      autoNewline.value = settings.autoNewline !== undefined ? settings.autoNewline : true
      hexMode.value = settings.hexMode || false
      // 将设置同步到 UnifiedTerminal
      unifiedTerminalRef.value?.setHexDisplayMode?.(hexDisplayMode.value)
      unifiedTerminalRef.value?.setAutoNewline?.(autoNewline.value)
      unifiedTerminalRef.value?.setHexMode?.(hexMode.value)
    }
  } catch (error) {
    console.error('加载串口设置失败:', error)
  }
}

// 保存串口设置
const saveComSettings = async () => {
  try {
    if (!props.connection.comName) return
    await window.storageApi.saveComSettings(props.connection.comName, {
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
      autoNewline: autoNewline.value,
      hexMode: hexMode.value
    })
  } catch (error) {
    console.error('保存串口设置失败:', error)
  }
}

// 更新备注并通知父组件
const updateRemark = async (newRemark: string) => {
  remark.value = newRemark
  await saveComSettings()
  emit('remarkUpdated', { comName: props.connection.comName, remark: newRemark })
}

// 加载全局波特率列表
const loadBaudRates = async () => {
  try {
    const rates = await window.storageApi.getBaudRates()
    baudRates.value = rates || [9600, 19200, 115200, 1500000]
  } catch (error) {
    console.error('加载波特率列表失败:', error)
    baudRates.value = [9600, 19200, 115200, 1500000]
  }
}

// 新增波特率
const addBaudRate = async () => {
  const rate = newBaudRate.value
  console.log('addBaudRate called, rate:', rate)
  console.log('baudRates before:', [...baudRates.value])
  if (rate && !baudRates.value.includes(rate)) {
    baudRates.value.push(rate)
    baudRates.value.sort((a, b) => a - b)
    baudRate.value = rate
    console.log('baudRates after push:', [...baudRates.value])
    try {
      await window.storageApi.saveBaudRates([...baudRates.value])
      console.log('saveBaudRates called successfully')
    } catch (error) {
      console.error('saveBaudRates error:', error)
    }
    ElMessage.success(`已添加波特率 ${rate}`)
  } else if (baudRates.value.includes(rate)) {
    ElMessage.warning('该波特率已存在')
    baudRate.value = rate
  }
  showAddBaudRateDialog.value = false
}

// 删除波特率
const deleteBaudRate = async (rate: number) => {
  if (baudRates.value.length <= 1) {
    ElMessage.warning('至少保留一个波特率')
    return
  }
  const index = baudRates.value.indexOf(rate)
  if (index > -1) {
    baudRates.value.splice(index, 1)
    if (baudRate.value === rate) {
      baudRate.value = baudRates.value[0]
    }
    try {
      await window.storageApi.saveBaudRates([...baudRates.value])
    } catch (error) {
      console.error('saveBaudRates error:', error)
    }
    ElMessage.success(`已删除波特率 ${rate}`)
  }
}

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
        // 根据 HEX 显示模式处理数据
        const displayData = hexDisplayMode.value ? bytesToHex(data.data) : data.data
        unifiedTerminalRef.value?.appendToTerminal(`\n${displayData}`)
      })

      if (removeCloseListener) removeCloseListener()
      removeCloseListener = window.connectApi.onConnectClose((sessionId: number | string) => {
        if (String(sessionId) !== String(props.connection.sessionId)) return
        // 如果是主动禁止重连，则不自动重连
        if (preventAutoReconnect.value) return
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

const handleSendCommand = async (command: string, originalInput?: string) => {
  if (!command.trim() || !isConnected.value) return

  // 根据 hexMode 决定显示内容：HEX模式下显示原始输入，否则显示解析后的数据
  const displayCommand = hexMode.value && originalInput ? originalInput : command
  unifiedTerminalRef.value?.appendToTerminal(`\n[TX] ${displayCommand}\n`)
  totalTxSize += command.length
  unifiedTerminalRef.value?.updateTxBytes(command.length)

  try {
    const connObj = {
      connectionType: 'com',
      comName: props.connection.comName,
      sessionId: props.connection.sessionId
    }
    await window.connectApi.sendData({
      conn: connObj,
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
  try {
    const result = await window.dialogApi.saveFileDialog({
      title: '保存日志',
      defaultPath: `com_${props.connection.comName}_${Date.now()}.log`,
      filters: [{ name: '日志文件', extensions: ['log', 'txt'] }]
    })
    if (result.filePath) {
      const copyResult = await window.connectApi.copyLogFile(props.connection.sessionId, result.filePath)
      if (copyResult.success) {
        ElMessage.success('日志保存成功')
        window.toolApi.showItemInFolder(result.filePath)
      } else {
        ElMessage.error('保存失败：' + (copyResult.message || '未知错误'))
      }
    }
  } catch (error) {
    ElMessage.error('保存失败')
  }
}

const handleCommandSent = (cmdName: string) => emit('commandSent', cmdName)

const refreshGroupsCmds = () => unifiedTerminalRef.value?.refreshGroupsCmds?.()

// 将字节数据转换为16进制字符串
const bytesToHex = (str: string): string => {
  let result = ''
  for (let i = 0; i < str.length; i++) {
    const hex = str.charCodeAt(i).toString(16)
    result += hex.padStart(2, '0') + ' '
  }
  return result.trim()
}

const reconnect = () => {
  // 重连时清空 rx/tx 统计
  totalRxSize = 0
  totalTxSize = 0
  unifiedTerminalRef.value?.resetRxTx()
  if (!isConnected.value && !isConnecting.value) {
    handleConnect()
  }
}

defineExpose({
  refreshGroupsCmds,
  reconnect,
  disconnect: handleClose,
  isConnected: isConnectedValue,
  preventAutoReconnect: () => { preventAutoReconnect.value = true },
  getRemark: () => remark.value,
  updateRemark
})

onMounted(async () => {
  // 加载全局波特率列表
  await loadBaudRates()

  // 加载保存的串口设置
  await loadComSettings()

  // 同步到 UnifiedTerminal
  nextTick(() => {
    unifiedTerminalRef.value?.setHexDisplayMode?.(hexDisplayMode.value)
    unifiedTerminalRef.value?.setAutoNewline?.(autoNewline.value)
    unifiedTerminalRef.value?.setHexMode?.(hexMode.value)
  })

  // 监听连接关闭事件，更新连接状态（无论从哪里断开）
  if (removeMountedCloseListener) removeMountedCloseListener()
  removeMountedCloseListener = window.connectApi.onConnectClose((sessionId: number | string) => {
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

.com-terminal .param-row .el-select.param-select .el-input__wrapper {
  height: 26px !important;
  min-height: 26px !important;
  padding: 0 8px !important;
}

.com-terminal .param-row .el-select.param-select .el-input__inner {
  height: 26px !important;
  line-height: 26px !important;
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
  color: #999;
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
  color: #999;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
}

.baud-option:hover .delete-icon {
  opacity: 1;
}

.delete-icon:hover {
  color: #f56c6c;
}

.more-btn {
  margin-left: auto;
  background-color: #1A97ED !important;
  border-color: #1A97ED !important;
  color: white !important;
  width: 90px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
}

.more-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.terminal-switch {
  margin-left: 8px;
}

.terminal-switch.el-switch {
  --el-switch-off-color: #131315 !important;
  --el-switch-on-color: #2E5CC7 !important;
}

.terminal-switch .el-switch__core {
  height: 20px !important;
  min-height: 20px !important;
  background-color: #131315 !important;
  border-color: transparent !important;
}

.terminal-switch .el-switch__core:hover {
  background-color: #2A2A2C !important;
}

.terminal-switch .el-switch__core::after {
  top: 2px !important;
  width: 16px !important;
  height: 16px !important;
}

.terminal-switch .el-switch.is-checked .el-switch__core {
  background-color: #2E5CC7 !important;
  border-color: #2E5CC7 !important;
}

.terminal-switch .el-switch__label {
  font-size: 11px;
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
