<template>
  <div class="terminal-control">
    <div class="header-left">
      <span class="connection-status" :class="isConnected ? 'connected' : 'disconnected'">
        {{ isConnected ? '已连接' : '已断开' }}
      </span>
      <el-button
        v-if="isConnected"
        type="danger"
        icon="Close"
        size="small"
        class="close-btn"
        @click="emit('onClose')"
      >
        断开
      </el-button>
      <el-button
        v-else
        type="primary"
        icon="Refresh"
        size="small"
        class="reconnect-btn toggle-btn"
        @click="emit('onReconnect')"
        :disabled="isConnecting"
      >
        {{ isConnecting ? '连接中...' : '重连' }}
      </el-button>
      <el-button
        type="default"
        icon="Delete"
        size="small"
        class="clear-btn"
        @click="emit('onClearTerminal')"
      >
        清空屏幕
      </el-button>
      <el-button type="default" icon="Document" size="small" class="log-btn" @click="emit('onOpenLog')">
        打开日志
      </el-button>
      <el-button type="default" icon="DocumentAdd" size="small" class="log-btn" @click="emit('onSaveLog')">
        日志另存为
      </el-button>
      <el-switch
        v-model="autoScroll"
        size="small"
        active-text="自动滚动"
      />
      <el-switch
        v-model="showLog"
        size="small"
        active-text="显示日志"
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
}>()

const autoScroll = computed({
  get: () => props.isAutoScroll,
  set: (val: boolean) => emit('update:isAutoScroll', val)
})

const showLog = computed({
  get: () => props.isShowLog,
  set: (val: boolean) => emit('update:isShowLog', val)
})
</script>

<style scoped>
.terminal-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid #333;
  background-color: #1e1e1e;
  box-sizing: border-box;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
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
  background-color: rgba(255, 95, 88, 0.2);
  color: #ff5f58;
}

.close-btn,
.clear-btn,
.add-preset-btn {
  width: 90px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
}

.log-btn {
  background-color: #1A97ED !important;
  border-color: #4db3f7 !important;
  color: white !important;
  width: 90px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  margin-left: 0 !important;
}

.log-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.clear-btn {
  background-color: #F56C6C !important;
  border-color: #f78989 !important;
  color: white !important;
  margin-left: 0 !important;
}

.clear-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.close-btn,
.reconnect-btn {
  width: 90px !important;
  padding: 6px 12px !important;
}

.close-btn {
  background-color: #FF0000 !important;
  border-color: #ff3333 !important;
  color: white !important;
}

.close-btn:hover {
  filter: brightness(0.85);
  transform: translateY(-1px);
}

.reconnect-btn {
  background-color: #165dff !important;
  border-color: #3370ff !important;
  color: white !important;
}

.reconnect-btn:hover {
  background-color: #4080ff !important;
  border-color: #5599ff !important;
  transform: translateY(-1px);
}

.reconnect-btn:disabled {
  background-color: #555 !important;
  border-color: #666 !important;
  color: #999 !important;
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
