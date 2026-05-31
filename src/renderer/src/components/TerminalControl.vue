<template>
  <div class="terminal-control">
    <div class="header-left">
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
        {{ isConnecting ? '连接中...' : '连接' }}
      </el-button>
      <el-button
        icon="Delete"
        size="small"
        class="btn-cancel clear-btn"
        @click="emit('onClearTerminal')"
      >
        清空
      </el-button>
      <el-button
        size="small"
        class="auto-scroll-btn"
        :class="{ 'auto-scroll-active': !autoScroll }"
        @click="autoScroll = !autoScroll"
        :title="autoScroll ? '取消自动滚动' : '自动滚动'"
      >
        <svg class="pin-icon-svg" viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor">
          <path d="M963.925333 326.997333L697.002667 60.074667a25.6 25.6 0 0 0-43.52 21.845333l14.506666 99.498667-273.066666 151.381333c-91.477333-45.738667-170.666667-36.693333-234.496 27.306667a25.941333 25.941333 0 0 0 0 36.352L327.68 563.2 57.685333 930.645333a25.6 25.6 0 0 0 35.84 35.669334l366.250667-270.677334 167.765333 167.936a25.941333 25.941333 0 0 0 36.352 0c79.530667-79.701333 58.538667-165.546667 26.965334-233.813333l152.064-273.066667 99.157333 14.165334a25.6 25.6 0 0 0 26.624-13.824 25.941333 25.941333 0 0 0-4.778667-30.037334z"/>
        </svg>
      </el-button>
      <el-button
        size="small"
        class="icon-action-btn"
        @click="emit('onOpenLog')"
        title="打开日志"
      >
        <el-icon :size="14"><Folder /></el-icon>
      </el-button>
      <el-switch
        v-model="showTimestamp"
        size="small"
        class="terminal-switch"
        active-text="时间戳"
      />
      <el-switch
        v-model="showLog"
        size="small"
        class="terminal-switch"
        active-text="显示日志"
      />
      <el-button icon="DocumentAdd" size="small" class="btn-primary log-btn" @click="emit('onSaveLog')">
        日志另存为
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Folder } from '@element-plus/icons-vue'

const props = defineProps<{
  isConnected: boolean
  isConnecting: boolean
  isAutoScroll: boolean
  isShowLog: boolean
  isShowTimestamp: boolean
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

.close-btn {
  width: 90px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  margin-left: 0 !important;
  background-color: #FF0000 !important;
  border-color: #FF0000 !important;
}

.clear-btn {
  width: 72px !important;
  height: 34px !important;
  padding: 6px 12px !important;
  border-radius: 4px !important;
  transition: all 0.2s ease !important;
  margin-left: 0 !important;
  background-color: #c45656 !important;
  border-color: #c45656 !important;
}

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



.close-btn {
  width: 72px !important;
  height: 34px !important;
  padding: 6px 12px !important;
}

.reconnect-btn {
  width: 72px !important;
  height: 34px !important;
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

.auto-scroll-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  border-radius: 4px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: transparent !important;
  border: 1px solid transparent !important;
  color: #aaa !important;
  transition: all 0.2s ease !important;
  margin-left: -2px !important;
}

.auto-scroll-btn:hover {
  background-color: rgba(128, 128, 128, 0.2) !important;
  color: #e0e0e0 !important;
}

.auto-scroll-active {
  background-color: #326BF1 !important;
  border-color: transparent !important;
  color: #fff !important;
}

.auto-scroll-active:hover {
  background-color: #326BF1 !important;
  color: #fff !important;
}

.icon-action-btn {
  width: 28px !important;
  height: 28px !important;
  min-width: 28px !important;
  padding: 0 !important;
  border-radius: 4px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  background-color: transparent !important;
  border: 1px solid transparent !important;
  color: #aaa !important;
  transition: all 0.2s ease !important;
  margin-left: -2px !important;
}

.icon-action-btn:hover {
  background-color: rgba(128, 128, 128, 0.2) !important;
  color: #e0e0e0 !important;
}

:deep(.el-switch) {
  --el-switch-on-color: #165dff;
  --el-switch-off-color: #444;
}

:deep(.el-switch__label) {
  color: #e0e0e0;
}
</style>
