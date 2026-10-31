<template>
  <div class="settings-json-view">
    <div class="settings-json-toolbar">
      <el-button size="small" class="btn-primary path-btn" @click="tryLeave">
        <el-icon><Back /></el-icon>{{ t('settings.viewForm') }}
      </el-button>

      <span class="settings-json-spacer" />

      <span v-if="status === 'applied'" class="settings-json-status applied">{{ t('settings.jsonApplied') }}</span>
    </div>

    <div v-if="error" class="settings-json-error">{{ error }}</div>

    <SettingsJsonEditor :text="editorText" @change="onChange" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { Back } from '@element-plus/icons-vue'
import SettingsJsonEditor from './SettingsJsonEditor.vue'
import {
  isSameSettings,
  mergeSettingsWithDefaults,
  parseSettingsJson,
  stringifySettings
} from '../../features/settings/jsonSettings'

const props = defineProps<{
  /** Currently effective settings (defaults already merged). */
  settings: Record<string, any>
  /** Factory defaults used to backfill keys removed while editing. */
  defaults: Record<string, any>
}>()

const emit = defineEmits<{
  leave: []
  apply: [value: Record<string, any>]
}>()

const { t } = useI18n()

const editorText = ref(stringifySettings(props.settings))
const error = ref('')
const status = ref<'idle' | 'applied'>('idle')
/** Snapshot of the last object this view pushed upwards, used to ignore self-triggered updates. */
let lastEmitted: Record<string, any> | null = null

watch(() => props.settings, (value) => {
  // Ignore echo: the change originated from this editor.
  if (lastEmitted && isSameSettings(value, lastEmitted)) return
  lastEmitted = null
  status.value = 'idle'
  error.value = ''
  editorText.value = stringifySettings(value)
})

const onChange = (text: string) => {
  const result = parseSettingsJson(text)
  if (!result.ok) {
    error.value = `${t('settings.jsonInvalid')}：${result.error}`
    status.value = 'idle'
    return
  }
  error.value = ''
  const merged = mergeSettingsWithDefaults(props.defaults, result.value)
  if (isSameSettings(merged, props.settings)) {
    lastEmitted = merged
    status.value = 'idle'
    return
  }
  lastEmitted = merged
  status.value = 'applied'
  emit('apply', merged)
}

const tryLeave = () => {
  if (error.value) {
    ElMessage.warning(t('settings.jsonLeaveBlocked'))
    return
  }
  emit('leave')
}
</script>

<style scoped>
.settings-json-view {
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
  box-sizing: border-box;
}

.settings-json-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* 复用全局 btn-primary 视觉，但保持内容宽度（main.css 的 .btn-primary 强制 100% 宽） */
.settings-json-toolbar :deep(.el-button) {
  width: auto !important;
  flex-shrink: 0;
  white-space: nowrap;
}

.settings-json-spacer {
  flex: 1;
}

.settings-json-status {
  font-size: 12px;
  color: var(--color-success);
}

.settings-json-error {
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
  color: var(--btn-danger-text);
  background: rgba(196, 86, 86, 0.15);
  border: 1px solid var(--btn-danger-bg);
}
</style>
