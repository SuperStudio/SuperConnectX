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
        {{ t('terminal.disconnect') }}
      </el-button>
      <el-button
        v-else
        icon="Refresh"
        size="small"
        class="btn-primary reconnect-btn toggle-btn"
        @click="emit('onReconnect')"
        :disabled="isConnecting"
      >
        {{ isConnecting ? t('terminal.connecting') : t('terminal.connect') }}
      </el-button>
      <el-button
        icon="Delete"
        size="small"
        class="btn-cancel clear-btn"
        @click="emit('onClearTerminal')"
      >
        {{ t('terminal.clear') }}
      </el-button>
      <el-tooltip :content="autoScroll ? t('terminal.cancelAutoScroll') : t('terminal.autoScroll')" placement="bottom" effect="dark">
        <el-button
          size="small"
          class="auto-scroll-btn"
          :class="{ 'auto-scroll-active': !autoScroll }"
          @click="autoScroll = !autoScroll"
        >
          <svg class="pin-icon-svg" viewBox="0 0 1024 1024" width="14" height="14" fill="currentColor">
            <path d="M963.925333 326.997333L697.002667 60.074667a25.6 25.6 0 0 0-43.52 21.845333l14.506666 99.498667-273.066666 151.381333c-91.477333-45.738667-170.666667-36.693333-234.496 27.306667a25.941333 25.941333 0 0 0 0 36.352L327.68 563.2 57.685333 930.645333a25.6 25.6 0 0 0 35.84 35.669334l366.250667-270.677334 167.765333 167.936a25.941333 25.941333 0 0 0 36.352 0c79.530667-79.701333 58.538667-165.546667 26.965334-233.813333l152.064-273.066667 99.157333 14.165334a25.6 25.6 0 0 0 26.624-13.824 25.941333 25.941333 0 0 0-4.778667-30.037334z"/>
          </svg>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="t('terminal.openLogFolder')" placement="bottom" effect="dark">
        <el-button
          size="small"
          class="icon-action-btn"
          @click="emit('onOpenLogFolder')"
        >
          <el-icon :size="14"><FolderOpened /></el-icon>
        </el-button>
      </el-tooltip>
      <el-tooltip :content="t('terminal.openLogFile')" placement="bottom" effect="dark">
        <el-button
          size="small"
          class="icon-action-btn"
          @click="emit('onOpenLogFile')"
        >
          <el-icon :size="14"><Document /></el-icon>
        </el-button>
      </el-tooltip>
      <el-switch
        v-model="showTimestamp"
        size="small"
        class="terminal-switch"
        :active-text="t('terminal.showTimestamp')"
      />
      <el-switch
        v-model="showLog"
        size="small"
        class="terminal-switch"
        :active-text="t('terminal.showLog')"
      />
      <el-button icon="DocumentAdd" size="small" class="btn-primary log-btn" @click="emit('onSaveLog')">
        {{ t('terminal.saveLogAs') }}
      </el-button>
      <el-select
        v-model="selectedSyntaxGroupId"
        size="small"
        class="syntax-group-select"
        :placeholder="t('terminal.syntaxHighlight')"
        clearable
        @change="handleSyntaxGroupChange"
      >
        <el-option
          v-for="group in syntaxGroups"
          :key="group.id"
          :label="group.name"
          :value="group.id"
        />
      </el-select>
      <el-tooltip :content="t('terminal.editSyntaxRules')" placement="bottom" effect="dark">
        <el-button
          size="small"
          class="icon-action-btn"
          @click="emit('onEditSyntaxRules')"
        >
          <el-icon :size="14"><Edit /></el-icon>
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { FolderOpened, Document, Edit } from '@element-plus/icons-vue'

const { t } = useI18n()

interface SyntaxGroupInfo {
  id: number
  name: string
}

const props = defineProps<{
  isConnected: boolean
  isConnecting: boolean
  isAutoScroll: boolean
  isShowLog: boolean
  isShowTimestamp: boolean
  activeSyntaxGroupId?: number
}>()

const emit = defineEmits<{
  onClose: []
  onReconnect: []
  onClearTerminal: []
  onOpenLogFolder: []
  onOpenLogFile: []
  onSaveLog: []
  onEditSyntaxRules: []
  'update:isAutoScroll': [value: boolean]
  'update:isShowLog': [value: boolean]
  'update:isShowTimestamp': [value: boolean]
  'update:activeSyntaxGroupId': [value: number | undefined]
}>()

const syntaxGroups = ref<SyntaxGroupInfo[]>([])

const selectedSyntaxGroupId = computed({
  get: () => props.activeSyntaxGroupId,
  set: (val: number | undefined) => emit('update:activeSyntaxGroupId', val)
})

const loadSyntaxGroups = async () => {
  try {
    const data = await window.storageApi.getSyntaxRuleGroups()
    if (data && Array.isArray(data)) {
      syntaxGroups.value = data.map((g: any) => ({ id: g.id, name: g.name }))
    }
  } catch (e) {
    console.error('Failed to load syntax groups:', e)
  }
}

const handleSyntaxGroupChange = () => {
  // 选中改变时触发
}

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

onMounted(() => {
  loadSyntaxGroups()
  window.addEventListener('syntax-rules-updated', loadSyntaxGroups)
})
</script>

<style scoped>
.terminal-control {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background-color: var(--theme-surface-bg, #252526);
  color: var(--theme-text-primary, #e8e8e8);
  border: 1px solid var(--theme-border-color, #3c3c3c);
  box-sizing: border-box;
  border-radius: 0px 0px 6px 6px;
  margin: 0px 4px 1px 2px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 4px;
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
  color: var(--theme-success-color, #18c138);
}

.connection-status.disconnected {
  background-color: rgba(128, 128, 128, 0.2);
  color: var(--theme-text-muted, #888888);
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
  margin-left: 4px !important;
  margin-right: 4px !important;
  background-color: #c45656 !important;
  border-color: #c45656 !important;
}

.clear-btn:hover {
  transform: translateY(-1px);
  background-color: #d46060 !important;
  border-color: #d46060 !important;
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
  margin-left: 10px !important;
}

.log-btn:hover {
  transform: translateY(-1px);
}

.syntax-group-select {
  width: 130px !important;
  margin-left: 4px !important;
}

.syntax-group-select :deep(.el-select__wrapper) {
  border-color: transparent !important;
  box-shadow: none !important;
  background-color: var(--theme-input-bg, #3a3a3a) !important;
  min-height: 28px !important;
  height: 28px !important;
}

.syntax-group-select :deep(.el-select__wrapper:hover),
.syntax-group-select :deep(.el-select .is-focused .el-select__wrapper),
.syntax-group-select :deep(.el-select.is-focused .el-select__wrapper) {
  border-color: var(--focus-border-color) !important;
  box-shadow: 0 0 0 1px var(--focus-border-color) inset !important;
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
  color: var(--theme-text-primary, #fff) !important;
  transition: all 0.2s ease !important;
  margin-left: 0px !important;
  margin-right: 0px !important;
}

.auto-scroll-btn:hover {
  background-color: var(--theme-hover-overlay, rgba(128, 128, 128, 0.2)) !important;
  color: var(--theme-text-primary, #fff) !important;
}

.auto-scroll-active {
  background-color: var(--theme-btn-primary-bg, #326BF1) !important;
  border-color: transparent !important;
  color: #fff !important;
}

.auto-scroll-active:hover {
  background-color: var(--theme-btn-primary-bg, #326BF1) !important;
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
  color: var(--theme-text-primary, #fff) !important;
  transition: all 0.2s ease !important;
  margin-left: 0px !important;
  margin-right: 2px !important;
}

.icon-action-btn:hover {
  background-color: var(--theme-hover-overlay, rgba(128, 128, 128, 0.2)) !important;
  color: var(--theme-text-primary, #fff) !important;
}

:deep(.el-switch) {
  --el-switch-on-color: var(--theme-switch-on-bg, #165dff);
  --el-switch-off-color: var(--theme-switch-off-bg, #444);
}

:deep(.el-switch__label) {
  color: var(--theme-text-primary, #e0e0e0);
}
</style>
