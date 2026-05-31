<template>
  <div class="terminal-control">
    <div class="header-left">
      <span class="connection-status" :class="isConnected ? 'connected' : 'disconnected'">
        {{ isConnected ? '已连接' : '已断开' }}
      </span>
      <el-button
        v-if="isConnected"
        icon="Close"
        size="small"
        class="btn-cancel close-btn"
        @click="emit('onClose')"
      >
        断开
      </el-button>
      <el-button
        v-else
        icon="Refresh"
        size="small"
        class="btn-primary reconnect-btn toggle-btn"
        @click="emit('onReconnect')"
        :disabled="isConnecting"
      >
        {{ isConnecting ? '连接中...' : '重连' }}
      </el-button>
      <el-button icon="Document" size="small" class="btn-primary log-btn" @click="emit('onOpenLog')">
        打开日志
      </el-button>
      <el-button icon="DocumentAdd" size="small" class="btn-primary log-btn" @click="emit('onSaveLog')">
        日志另存为
      </el-button>
      <el-button
        icon="Delete"
        size="small"
        class="btn-cancel clear-btn"
        @click="emit('onClearTerminal')"
      >
        清空屏幕
      </el-button>
      <el-switch
        v-model="autoScroll"
        size="small"
        class="terminal-switch"
        active-text="自动滚动"
      />
      <el-switch
        v-model="showLog"
        size="small"
        class="terminal-switch"
        active-text="显示日志"
      />
      <el-switch
        v-model="showTimestamp"
        size="small"
        class="terminal-switch"
        active-text="时间戳"
      />
    </div>
    <div class="rx-tx-info">
      <span class="rx">RX: {{ rxBytes }}</span>
      <span class="tx">TX: {{ txBytes }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  isConnected: boolean
  isConnecting: boolean
  isAutoScroll: boolean
  isShowLog: boolean
  isShowTimestamp: boolean
  rxBytes: string
  txBytes: string
}>()

const emit = defineEmits<{
  onClose: []
  onReconnect: []
  onClearTerminal: []
  onOpenLog: []
  onSaveLog: []
  'update:isAutoScroll': [value: boolean]
  'update:isShowLog': [value: boolean]
  'update:isShowTimestamp': [value: boolean]
}>()

const autoScroll = computed({
  get: () => props.isAutoScroll,
  set: (val: boolean) => emit('update:isAutoScroll', val)
})

const showLog = computed({
  get: () => props.isShowLog,
  set: (val: boolean) => emit('update:isShowLog', val)
})

const showTimestamp = computed({
  get: () => props.isShowTimestamp,
  set: (val: boolean) => emit('update:isShowTimestamp', val)
})
</script>

<style scoped>
.terminal-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: #252526;
  box-sizing: border-box;
  border-radius: 0px 0px 6px 6px;
  margin: 0px 4px 2px 2px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  flex: 1;
}

.rx-tx-info {
  display: flex;
  gap: 12px;
  font-size: 12px;
  margin-left: auto;
}

.rx-tx-info .rx {
  color: #4ade80;
}

.rx-tx-info .tx {
  color: #60a5fa;
}

.connection-status {
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: normal;
}

.connection-status.connected {
  background-color: rgba(24, 193, 56, 0.2);
  color: #18c138;
}

.connection-status.disconnected {
  background-color: rgba(128, 128, 128, 0.2);
  color: #888888;
}

.close-btn,
.clear-btn,
.add-preset-btn {
  width: 90px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  margin-left: 0 !important;
  background-color: #c45656 !important;
  border-color: #c45656 !important;
}

.log-btn {
  width: 90px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  margin-left: 0 !important;
}

.log-btn:hover {
  transform: translateY(-1px);
}



.close-btn,
.reconnect-btn {
  width: 90px !important;
  padding: 6px 12px !important;
}

.close-btn:hover {
  transform: translateY(-1px);
}

.reconnect-btn:hover {
  transform: translateY(-1px);
}

.reconnect-btn:disabled {
  cursor: not-allowed !important;
}

:deep(.el-switch) {
  --el-switch-on-color: #165dff;
  --el-switch-off-color: #444;
}

:deep(.el-switch__label) {
  color: #e0e0e0;
}
</style>
