<template>
  <div class="unified-terminal">
    <!-- 终端输出区域 -->
    <div ref="editorContainer" class="terminal-output">
      <!-- 滚动按钮 -->
      <div class="scroll-wrapper">
        <el-button icon="ArrowUp" size="mini" circle @click="handleScrollToTop" class="scroll-btn up-btn" />
        <el-button icon="ArrowDown" size="mini" circle @click="handleScrollToBottom" class="scroll-btn down-btn" />
      </div>
    </div>

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
        <span class="prompt">></span>
        <div class="input-wrapper" @click="commandInput?.focus()">
          <input
            v-model="currentCommand"
            @keydown="handleInputKeydown"
            :placeholder="isConnected ? (hexMode ? '输入HEX数据 (如: 01 02 03)' : placeholder) : '连接后可发送命令'"
            ref="commandInput"
            class="command-input"
            :class="{ 'not-connected': !isConnected, 'hex-mode': hexMode }"
            :disabled="!isConnected"
            @input="onInputChange"
            @focus="onInputFocus"
            @blur="onInputBlur"
          />
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
            class="btn-crc"
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
              <el-select v-model="crcMethod" size="small" class="crc-method-select">
                <el-option label="CRC8" value="crc8" />
                <el-option label="CRC16 Modbus" value="crc16modbus" />
                <el-option label="CRC16 CCITT" value="crc16ccitt" />
                <el-option label="CRC32" value="crc32" />
              </el-select>
            </div>
          </div>
        </div>
        <template v-if="crcEnabled">
          <div v-if="crcInputError" class="crc-inline-error">{{ crcInputError }}</div>
          <div v-else-if="!crcInputData" class="crc-inline-empty">{{ t('comTerminal.crcInputEmpty') }}</div>
          <div v-else class="crc-inline-result">
            <span class="crc-inline-label">{{ crcMethodLabel }}</span>
            <span class="crc-inline-value">{{ crcResult }}</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import * as monaco from 'monaco-editor'
import PresetCommands from './PresetCommands.vue'
import TerminalControl from './TerminalControl.vue'

const MAX_CLEAR_INTERVAL_SIZE = 1024 * 1024 * 30

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
const commandInput = ref<HTMLInputElement | null>(null)
const isConnected = ref(props.isConnected)
const isConnecting = ref(props.isConnecting)
const isAutoScroll = ref(true)
const isShowLog = ref(true)
const editorContainer = ref<HTMLElement | null>(null)
const autoNewline = ref(true) // 是否自动添加回车换行
const hexMode = ref(false) // 是否为HEX发送模式
const hexDisplayMode = ref(false) // 是否为HEX显示模式（接收端）
const showTimestamp = ref(true) // 是否显示时间戳
const fontSize = ref(14) // 终端字体大小
const fontFamily = ref('Fira Code') // 终端字体系列
const MIN_FONT_SIZE = 8
const MAX_FONT_SIZE = 30

const { t } = useI18n()

// ---------- CRC 查找表与计算函数 (纯 JS 实现) ----------
const CRC8_TABLE = [
  0x00, 0x07, 0x0e, 0x09, 0x1c, 0x1b, 0x12, 0x15,
  0x38, 0x3f, 0x36, 0x31, 0x24, 0x23, 0x2a, 0x2d,
  0x70, 0x77, 0x7e, 0x79, 0x6c, 0x6b, 0x62, 0x65,
  0x48, 0x4f, 0x46, 0x41, 0x54, 0x53, 0x5a, 0x5d,
  0xe0, 0xe7, 0xee, 0xe9, 0xfc, 0xfb, 0xf2, 0xf5,
  0xd8, 0xdf, 0xd6, 0xd1, 0xc4, 0xc3, 0xca, 0xcd,
  0x90, 0x97, 0x9e, 0x99, 0x8c, 0x8b, 0x82, 0x85,
  0xa8, 0xaf, 0xa6, 0xa1, 0xb4, 0xb3, 0xba, 0xbd,
  0xc7, 0xc0, 0xc9, 0xce, 0xdb, 0xdc, 0xd5, 0xd2,
  0xff, 0xf8, 0xf1, 0xf6, 0xe3, 0xe4, 0xed, 0xea,
  0xb7, 0xb0, 0xb9, 0xbe, 0xab, 0xac, 0xa5, 0xa2,
  0x8f, 0x88, 0x81, 0x86, 0x93, 0x94, 0x9d, 0x9a,
  0x27, 0x20, 0x29, 0x2e, 0x3b, 0x3c, 0x35, 0x32,
  0x1f, 0x18, 0x11, 0x16, 0x03, 0x04, 0x0d, 0x0a,
  0x57, 0x50, 0x59, 0x5e, 0x4b, 0x4c, 0x45, 0x42,
  0x6f, 0x68, 0x61, 0x66, 0x73, 0x74, 0x7d, 0x7a,
  0x89, 0x8e, 0x87, 0x80, 0x95, 0x92, 0x9b, 0x9c,
  0xb1, 0xb6, 0xbf, 0xb8, 0xad, 0xaa, 0xa3, 0xa4,
  0xf9, 0xfe, 0xf7, 0xf0, 0xe5, 0xe2, 0xeb, 0xec,
  0xc1, 0xc6, 0xcf, 0xc8, 0xdd, 0xda, 0xd3, 0xd4,
  0x69, 0x6e, 0x67, 0x60, 0x75, 0x72, 0x7b, 0x7c,
  0x51, 0x56, 0x5f, 0x58, 0x4d, 0x4a, 0x43, 0x44,
  0x19, 0x1e, 0x17, 0x10, 0x05, 0x02, 0x0b, 0x0c,
  0x21, 0x26, 0x2f, 0x28, 0x3d, 0x3a, 0x33, 0x34,
  0x4e, 0x49, 0x40, 0x47, 0x52, 0x55, 0x5c, 0x5b,
  0x76, 0x71, 0x78, 0x7f, 0x6a, 0x6d, 0x64, 0x63,
  0x3e, 0x39, 0x30, 0x37, 0x22, 0x25, 0x2c, 0x2b,
  0x06, 0x01, 0x08, 0x0f, 0x1a, 0x1d, 0x14, 0x13,
  0xae, 0xa9, 0xa0, 0xa7, 0xb2, 0xb5, 0xbc, 0xbb,
  0x96, 0x91, 0x98, 0x9f, 0x8a, 0x8d, 0x84, 0x83,
  0xde, 0xd9, 0xd0, 0xd7, 0xc2, 0xc5, 0xcc, 0xcb,
  0xe6, 0xe1, 0xe8, 0xef, 0xfa, 0xfd, 0xf4, 0xf3
]

const CRC16_MODBUS_TABLE = [
  0x0000, 0xc0c1, 0xc181, 0x0140, 0xc301, 0x03c0, 0x0280, 0xc241,
  0xc601, 0x06c0, 0x0780, 0xc741, 0x0500, 0xc5c1, 0xc481, 0x0440,
  0xcc01, 0x0cc0, 0x0d80, 0xcd41, 0x0f00, 0xcfc1, 0xce81, 0x0e40,
  0x0a00, 0xcac1, 0xcb81, 0x0b40, 0xc901, 0x09c0, 0x0880, 0xc841,
  0xd801, 0x18c0, 0x1980, 0xd941, 0x1b00, 0xdbc1, 0xda81, 0x1a40,
  0x1e00, 0xdec1, 0xdf81, 0x1f40, 0xdd01, 0x1dc0, 0x1c80, 0xdc41,
  0x1400, 0xd4c1, 0xd581, 0x1540, 0xd701, 0x17c0, 0x1680, 0xd641,
  0xd201, 0x12c0, 0x1380, 0xd341, 0x1100, 0xd1c1, 0xd081, 0x1040,
  0xf001, 0x30c0, 0x3180, 0xf141, 0x3300, 0xf3c1, 0xf281, 0x3240,
  0x3600, 0xf6c1, 0xf781, 0x3740, 0xf501, 0x35c0, 0x3480, 0xf441,
  0x3c00, 0xfcc1, 0xfd81, 0x3d40, 0xff01, 0x3fc0, 0x3e80, 0xfe41,
  0xfa01, 0x3ac0, 0x3b80, 0xfb41, 0x3900, 0xf9c1, 0xf881, 0x3840,
  0x2800, 0xe8c1, 0xe981, 0x2940, 0xeb01, 0x2bc0, 0x2a80, 0xea41,
  0xee01, 0x2ec0, 0x2f80, 0xef41, 0x2d00, 0xedc1, 0xec81, 0x2c40,
  0xe401, 0x24c0, 0x2580, 0xe541, 0x2700, 0xe7c1, 0xe681, 0x2640,
  0x2200, 0xe2c1, 0xe381, 0x2340, 0xe101, 0x21c0, 0x2080, 0xe041,
  0xa001, 0x60c0, 0x6180, 0xa141, 0x6300, 0xa3c1, 0xa281, 0x6240,
  0x6600, 0xa6c1, 0xa781, 0x6740, 0xa501, 0x65c0, 0x6480, 0xa441,
  0x6c00, 0xacc1, 0xad81, 0x6d40, 0xaf01, 0x6fc0, 0x6e80, 0xae41,
  0xaa01, 0x6ac0, 0x6b80, 0xab41, 0x6900, 0xa9c1, 0xa881, 0x6840,
  0x7800, 0xb8c1, 0xb981, 0x7940, 0xbb01, 0x7bc0, 0x7a80, 0xba41,
  0xbe01, 0x7ec0, 0x7f80, 0xbf41, 0x7d00, 0xbdc1, 0xbc81, 0x7c40,
  0xb401, 0x74c0, 0x7580, 0xb541, 0x7700, 0xb7c1, 0xb681, 0x7640,
  0x7200, 0xb2c1, 0xb381, 0x7340, 0xb101, 0x71c0, 0x7080, 0xb041,
  0x5000, 0x90c1, 0x9181, 0x5140, 0x9301, 0x53c0, 0x5280, 0x9241,
  0x9601, 0x56c0, 0x5780, 0x9741, 0x5500, 0x95c1, 0x9481, 0x5440,
  0x9c01, 0x5cc0, 0x5d80, 0x9d41, 0x5f00, 0x9fc1, 0x9e81, 0x5e40,
  0x5a00, 0x9ac1, 0x9b81, 0x5b40, 0x9901, 0x59c0, 0x5880, 0x9841,
  0x8801, 0x48c0, 0x4980, 0x8941, 0x4b00, 0x8bc1, 0x8a81, 0x4a40,
  0x4e00, 0x8ec1, 0x8f81, 0x4f40, 0x8d01, 0x4dc0, 0x4c80, 0x8c41,
  0x4400, 0x84c1, 0x8581, 0x4540, 0x8701, 0x47c0, 0x4680, 0x8641,
  0x8201, 0x42c0, 0x4380, 0x8341, 0x4100, 0x81c1, 0x8081, 0x4040
]

const CRC16_CCITT_TABLE = [
  0x0000, 0x1021, 0x2042, 0x3063, 0x4084, 0x50a5, 0x60c6, 0x70e7,
  0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad, 0xe1ce, 0xf1ef,
  0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7, 0x62d6,
  0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
  0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485,
  0xa56a, 0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d,
  0x3653, 0x2672, 0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4,
  0xb75b, 0xa77a, 0x9719, 0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc,
  0x48c4, 0x58e5, 0x6886, 0x78a7, 0x0840, 0x1861, 0x2802, 0x3823,
  0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948, 0x9969, 0xa90a, 0xb92b,
  0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50, 0x3a33, 0x2a12,
  0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b, 0xab1a,
  0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41,
  0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49,
  0x7e97, 0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70,
  0xff9f, 0xefbe, 0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78,
  0x9188, 0x81a9, 0xb1ca, 0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f,
  0x1080, 0x00a1, 0x30c2, 0x20e3, 0x5004, 0x4025, 0x7046, 0x6067,
  0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d, 0xd31c, 0xe37f, 0xf35e,
  0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214, 0x6277, 0x7256,
  0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c, 0xc50d,
  0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
  0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c,
  0x26d3, 0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634,
  0xd94c, 0xc96d, 0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab,
  0x5844, 0x4865, 0x7806, 0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3,
  0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e, 0x8bf9, 0x9bd8, 0xabbb, 0xbb9a,
  0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1, 0x1ad0, 0x2ab3, 0x3a92,
  0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b, 0x9de8, 0x8dc9,
  0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0, 0x0cc1,
  0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8,
  0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0
]

const CRC32_TABLE = [
  0x00000000, 0x77073096, 0xee0e612c, 0x990951ba, 0x076dc419, 0x706af48f,
  0xe963a535, 0x9e6495a3, 0x0edb8832, 0x79dcb8a4, 0xe0d5e91e, 0x97d2d988,
  0x09b64c2b, 0x7eb17cbd, 0xe7b82d07, 0x90bf1d91, 0x1db71064, 0x6ab020f2,
  0xf3b97148, 0x84be41de, 0x1adad47d, 0x6ddde4eb, 0xf4d4b551, 0x83d385c7,
  0x136c9856, 0x646ba8c0, 0xfd62f97a, 0x8a65c9ec, 0x14015c4f, 0x63066cd9,
  0xfa0f3d63, 0x8d080df5, 0x3b6e20c8, 0x4c69105e, 0xd56041e4, 0xa2677172,
  0x3c03e4d1, 0x4b04d447, 0xd20d85fd, 0xa50ab56b, 0x35b5a8fa, 0x42b2986c,
  0xdbbbc9d6, 0xacbcf940, 0x32d86ce3, 0x45df5c75, 0xdcd60dcf, 0xabd13d59,
  0x26d930ac, 0x51de003a, 0xc8d75180, 0xbfd06116, 0x21b4f4b5, 0x56b3c423,
  0xcfba9599, 0xb8bda50f, 0x2802b89e, 0x5f058808, 0xc60cd9b2, 0xb10be924,
  0x2f6f7c87, 0x58684c11, 0xc1611dab, 0xb6662d3d, 0x76dc4190, 0x01db7106,
  0x98d220bc, 0xefd5102a, 0x71b18589, 0x06b6b51f, 0x9fbfe4a5, 0xe8b8d433,
  0x7807c9a2, 0x0f00f934, 0x9609a88e, 0xe10e9818, 0x7f6a0dbb, 0x086d3d2d,
  0x91646c97, 0xe6635c01, 0x6b6b51f4, 0x1c6c6162, 0x856530d8, 0xf262004e,
  0x6c0695ed, 0x1b01a57b, 0x8208f4c1, 0xf50fc457, 0x65b0d9c6, 0x12b7e950,
  0x8bbeb8ea, 0xfcb9887c, 0x62dd1ddf, 0x15da2d49, 0x8cd37cf3, 0xfbd44c65,
  0x4db26158, 0x3ab551ce, 0xa3bc0074, 0xd4bb30e2, 0x4adfa541, 0x3dd895d7,
  0xa4d1c46d, 0xd3d6f4fb, 0x4369e96a, 0x346ed9fc, 0xad678846, 0xda60b8d0,
  0x44042d73, 0x33031de5, 0xaa0a4c5f, 0xdd0d7cc9, 0x5005713c, 0x270241aa,
  0xbe0b1010, 0xc90c2086, 0x5768b525, 0x206f85b3, 0xb966d409, 0xce61e49f,
  0x5edef90e, 0x29d9c998, 0xb0d09822, 0xc7d7a8b4, 0x59b33d17, 0x2eb40d81,
  0xb7bd5c3b, 0xc0ba6cad, 0xedb88320, 0x9abfb3b6, 0x03b6e20c, 0x74b1d29a,
  0xead54739, 0x9dd277af, 0x04db2615, 0x73dc1683, 0xe3630b12, 0x94643b84,
  0x0d6d6a3e, 0x7a6a5aa8, 0xe40ecf0b, 0x9309ff9d, 0x0a00ae27, 0x7d079eb1,
  0xf00f9344, 0x8708a3d2, 0x1e01f268, 0x6906c2fe, 0xf762575d, 0x806567cb,
  0x196c3671, 0x6e6b06e7, 0xfed41b76, 0x89d32be0, 0x10da7a5a, 0x67dd4acc,
  0xf9b9df6f, 0x8ebeeff9, 0x17b7be43, 0x60b08ed5, 0xd6d6a3e8, 0xa1d1937e,
  0x38d8c2c4, 0x4fdff252, 0xd1bb67f1, 0xa6bc5767, 0x3fb506dd, 0x48b2364b,
  0xd80d2bda, 0xaf0a1b4c, 0x36034af6, 0x41047a60, 0xdf60efc3, 0xa867df55,
  0x316e8eef, 0x4669be79, 0xcb61b38c, 0xbc66831a, 0x256fd2a0, 0x5268e236,
  0xcc0c7795, 0xbb0b4703, 0x220216b9, 0x5505262f, 0xc5ba3bbe, 0xb2bd0b28,
  0x2bb45a92, 0x5cb36a04, 0xc2d7ffa7, 0xb5d0cf31, 0x2cd99e8b, 0x5bdeae1d,
  0x9b64c2b0, 0xec63f226, 0x756aa39c, 0x026d930a, 0x9c0906a9, 0xeb0e363f,
  0x72076785, 0x05005713, 0x95bf4a82, 0xe2b87a14, 0x7bb12bae, 0x0cb61b38,
  0x92d28e9b, 0xe5d5be0d, 0x7cdcefb7, 0x0bdbdf21, 0x86d3d2d4, 0xf1d4e242,
  0x68ddb3f8, 0x1fda836e, 0x81be16cd, 0xf6b9265b, 0x6fb077e1, 0x18b74777,
  0x88085ae6, 0xff0f6a70, 0x66063bca, 0x11010b5c, 0x8f659eff, 0xf862ae69,
  0x616bffd3, 0x166ccf45, 0xa00ae278, 0xd70dd2ee, 0x4e048354, 0x3903b3c2,
  0xa7672661, 0xd06016f7, 0x4969474d, 0x3e6e77db, 0xaed16a4a, 0xd9d65adc,
  0x40df0b66, 0x37d83bf0, 0xa9bcae53, 0xdebb9ec5, 0x47b2cf7f, 0x30b5ffe9,
  0xbdbdf21c, 0xcabac28a, 0x53b39330, 0x24b4a3a6, 0xbad03605, 0xcdd70693,
  0x54de5729, 0x23d967bf, 0xb3667a2e, 0xc4614ab8, 0x5d681b02, 0x2a6f2b94,
  0xb40bbe37, 0xc30c8ea1, 0x5a05df1b, 0x2d02ef8d
]

function calcCrc8(bytes: Uint8Array): number {
  let crc = 0
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC8_TABLE[(crc ^ bytes[i]) & 0xff] & 0xff
  }
  return crc
}

function calcCrc16Modbus(bytes: Uint8Array): number {
  let crc = 0xffff
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC16_MODBUS_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >> 8)) & 0xffff
  }
  return crc
}

function calcCrc16CCITT(bytes: Uint8Array): number {
  let crc = 0xffff
  for (let i = 0; i < bytes.length; i++) {
    crc = (CRC16_CCITT_TABLE[((crc >> 8) ^ bytes[i]) & 0xff] ^ (crc << 8)) & 0xffff
  }
  return crc
}

function calcCrc32(bytes: Uint8Array): number {
  let crc = 0 ^ (-1)
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ (-1)) >>> 0
}

// CRC 计算相关
const showCrcMenu = ref(false)
const crcEnabled = ref(true)
const crcMethod = ref<'crc8' | 'crc16modbus' | 'crc16ccitt' | 'crc32'>('crc32')
const crcBtnRef = ref<HTMLElement | null>(null)

const crcMethodLabel = computed(() => {
  const labels: Record<string, string> = {
    crc8: 'CRC8',
    crc16modbus: 'CRC16 Modbus',
    crc16ccitt: 'CRC16 CCITT',
    crc32: 'CRC32'
  }
  return labels[crcMethod.value] || ''
})

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
        bytes[i / 2] = parseInt(cleaned.substr(i, 2), 16)
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

// CRC计算结果（仅计算当前选中的方式）
// 格式化为空格分隔的HEX字节（如 "AB CD 12 34"）
const formatCrcHex = (val: number, byteCount: number): string => {
  const hex = val.toString(16).padStart(byteCount * 2, '0')
  const bytes: string[] = []
  for (let i = 0; i < hex.length; i += 2) {
    bytes.push(hex.substring(i, i + 2).toUpperCase())
  }
  return bytes.join(' ')
}

const crcResult = computed((): string => {
  const data = crcInputData.value
  if (!data) return '-'
  switch (crcMethod.value) {
    case 'crc8':
      return formatCrcHex(calcCrc8(data), 1)
    case 'crc16modbus':
      return formatCrcHex(calcCrc16Modbus(data), 2)
    case 'crc16ccitt':
      return formatCrcHex(calcCrc16CCITT(data), 2)
    case 'crc32':
      return formatCrcHex(calcCrc32(data), 4)
    default:
      return '-'
  }
})

// 获取 CRC 的原始二进制字节（用于附加到发送数据）
const getCrcBytesBinary = (): string | null => {
  const data = crcInputData.value
  if (!data) return null
  let crcVal: number
  let byteCount: number
  switch (crcMethod.value) {
    case 'crc8':
      crcVal = calcCrc8(data)
      byteCount = 1
      break
    case 'crc16modbus':
      crcVal = calcCrc16Modbus(data)
      byteCount = 2
      break
    case 'crc16ccitt':
      crcVal = calcCrc16CCITT(data)
      byteCount = 2
      break
    case 'crc32':
      crcVal = calcCrc32(data)
      byteCount = 4
      break
    default:
      return null
  }
  // 大端序输出原始字节
  let binary = ''
  for (let i = byteCount - 1; i >= 0; i--) {
    binary += String.fromCharCode((crcVal >> (i * 8)) & 0xff)
  }
  return binary
}

// 命令历史相关
const commandHistory = ref<string[]>([])
const showHistoryPopup = ref(false)
const historySelectedIndex = ref(-1)
let historyTempInput = '' // 保存输入时临时内容，用于上下键恢复
let historyFilterInput = '' // 导航时的过滤基准，避免选中改变输入后过滤结果变化
let showCommandHistory = true // 是否显示历史命令弹窗
let editor: monaco.editor.IStandaloneCodeEditor | null = null
let editorModel: monaco.editor.ITextModel | null = null
let totalRecvSize = 0
let totalTxSize = 0
let isInternalChange = false // 标记是否由内部触发的 isAutoScroll 变化

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
    isAutoScroll.value = false
  })

  // 在 editor 上监听滚轮事件（用于 Ctrl+滚轮缩放）
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
  if (totalRecvSize > MAX_CLEAR_INTERVAL_SIZE) {
    clearTerminal()
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
    console.error('加载命令历史失败:', error)
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
    console.error('保存命令历史失败:', error)
  }
}

const onInputChange = () => {
  historySelectedIndex.value = -1
  historyTempInput = currentCommand.value
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
    console.error('删除命令历史失败:', error)
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
    handleSendCommand()
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
          historyTempInput = currentCommand.value
          historyFilterInput = currentCommand.value.trim().toLowerCase()
        }
        historySelectedIndex.value = list.length - 1
      } else {
        historySelectedIndex.value--
      }
    } else {
      if (historySelectedIndex.value === -1) {
        historyTempInput = currentCommand.value
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
      console.error('无效的HEX格式')
      return null
    }
    // 转换为二进制字符串
    let result = ''
    for (let i = 0; i < cleaned.length; i += 2) {
      result += String.fromCharCode(parseInt(cleaned.substr(i, 2), 16))
    }
    return result
  } catch (error) {
    console.error('HEX解析错误:', error)
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
  setCrcMethod: (val: string) => { crcMethod.value = val as any },
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

onMounted(() => {
  initEditor()
  loadHistory()

  // 监听设置更新事件（历史最大数量变化时刷新）
  window.addEventListener('settings-updated', handleSettingsUpdated)
  // 点击外部关闭CRC菜单
  document.addEventListener('click', handleClickOutsideCrc)
})

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
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  white-space: pre-wrap;
  line-height: 1.5;
  background-color: #1e1e1e;
  position: relative;
  border: 1px solid transparent;
  transition: border-color 0.2s;
}

.terminal-output:focus-within {
  border-color: #007fd4;
}

.preset-commands-row {
  padding: 8px 12px;
  background-color: #252526;
  border-bottom: 1px solid #333;
}

.terminal-input {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  background-color: #333;
  margin: 8px 8px 8px 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  transition: border-color 0.2s;
}

.terminal-input:focus-within {
  border-color: #007fd4;
}

.terminal-input.has-crc {
  /* CRC 栏打开时自动高度 */
}

.input-row {
  display: flex;
  align-items: center;
  height: 38px;
}

.prompt {
  color: #cccccc;
  font-weight: bold;
  white-space: nowrap;
  margin-left: 10px;
  user-select: none;
}

.command-input {
  flex: 1;
  background: transparent;
  border: none;
  color: #fff;
  outline: none;
  font-family: monospace;
  font-size: 14px;
  padding: 0 8px;
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
  align-items: center;
  gap: 12px;
  margin-right: 8px;
  margin-left: 8px;
}

.terminal-switch {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-right: 8px;
  margin-left: 8px;
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
  width: auto !important;
}

.command-input.hex-mode {
  font-family: monospace;
  letter-spacing: 1px;
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
  background: #3a3a3d !important;
  border: 1px solid #555 !important;
  color: #ccc !important;
  transition: all 0.2s;
  flex-shrink: 0;
}

.btn-crc:hover {
  background: #4a4a4d !important;
  border-color: #007fd4 !important;
  color: #fff !important;
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
  padding: 4px 8px;
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
