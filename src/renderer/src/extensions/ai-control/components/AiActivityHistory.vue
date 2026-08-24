<template>
  <section class="activity-history">
    <header class="history-header">
      <div>
        <div class="title-row">
          <h3>{{ t('aiService.activityTitle') }}</h3>
          <span>{{ t('aiService.activityReadOnly') }}</span>
        </div>
        <p>{{ t('aiService.activityDesc') }}</p>
      </div>
      <div class="history-actions">
        <button class="btn-primary" @click="load">{{ t('aiService.activityRefresh') }}</button>
        <button class="btn-primary" @click="openDirectory">
          {{ t('aiService.openLogDirectory') }}
        </button>
        <button class="btn-primary" @click="clearHistory">{{ t('aiService.clearHistory') }}</button>
      </div>
    </header>
    <div class="log-file" :title="logDirectory">
      {{ t('aiService.activityFile') }}：{{ logDirectory }}
    </div>
    <p v-if="error" class="error">{{ error }}</p>
    <div ref="scrollContainer" class="entries" tabindex="0" @scroll="handleScroll">
      <article
        v-for="entry in entries"
        :key="entry.id"
        :class="['entry', entry.action, entry.status]"
      >
        <div class="entry-header">
          <time>{{ formatTime(entry.timestamp) }}</time>
          <strong>{{ t(`aiService.activity.${entry.action}`) }}</strong>
          <span>{{ t(`aiService.activity.${entry.status}`) }}</span>
        </div>
        <div class="entry-method">{{ methodLabel(entry.operation) }}</div>
        <div v-if="entry.clientName || entry.sessionId" class="entry-detail">
          {{ entry.clientName || '-'
          }}<template v-if="entry.sessionId"> · {{ entry.sessionId }}</template>
        </div>
        <div v-if="entry.details || entry.errorCode" class="entry-detail">
          {{ detailLabel(entry) }}
        </div>
      </article>
      <div v-if="!entries.length" class="empty">{{ t('aiService.noActivity') }}</div>
    </div>
    <footer>
      <span :class="['follow', { paused: !autoFollow }]"
        ><i></i>{{ autoFollow ? t('aiService.activityLive') : t('aiService.activityPaused') }}</span
      >
      <span class="count">{{ t('aiService.activityCount', { count: entries.length }) }}</span>
      <button v-if="!autoFollow" type="button" class="latest" @click="scrollToLatest">
        {{ t('aiService.activityReturnLatest') }}
      </button>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessageBox } from 'element-plus'
import type { AiActivityEntry } from '../../../../../shared/extensions/ai-control/AiActivityTypes'
import type { RuntimeUiEvent } from '../../../../../shared/extensions/ai-control/AiServiceTypes'
import { formatLocalTimestamp } from '../utils/formatLocalTimestamp'

defineProps<{ logDirectory: string }>()
const { t, te } = useI18n()
const entries = ref<AiActivityEntry[]>([])
const error = ref('')
const autoFollow = ref(true)
const scrollContainer = ref<HTMLElement | null>(null)
const knownIds = new Set<string>()
let releaseRuntime: (() => void) | undefined

const append = (entry: AiActivityEntry): void => {
  if (knownIds.has(entry.id)) return
  knownIds.add(entry.id)
  entries.value.push(entry)
  if (entries.value.length > 500) {
    const removed = entries.value.splice(0, entries.value.length - 500)
    for (const item of removed) knownIds.delete(item.id)
  }
  if (autoFollow.value) void scrollToBottom()
}
const fromRuntime = (event: RuntimeUiEvent): AiActivityEntry | null => {
  if (event.eventType !== 'ai.activity' || event.source !== 'ai') return null
  const payload = event.payload || {}
  return {
    id: event.eventId || `${event.timestamp || ''}-${event.sequence || 0}`,
    timestamp: event.timestamp || new Date().toISOString(),
    operation: typeof payload.method === 'string' ? payload.method : 'unknown',
    action: payload.action === 'read' ? 'read' : 'control',
    status: payload.status === 'failed' ? 'failed' : 'success',
    principalId: typeof payload.principalId === 'string' ? payload.principalId : undefined,
    clientName: typeof payload.clientName === 'string' ? payload.clientName : undefined,
    sessionId: event.sessionId,
    errorCode: typeof payload.errorCode === 'string' ? payload.errorCode : undefined,
    details:
      payload.details && typeof payload.details === 'object'
        ? (payload.details as Record<string, unknown>)
        : undefined
  }
}
const load = async (): Promise<void> => {
  try {
    const history = await window.aiServiceApi.readActivity(500)
    const live = entries.value.slice()
    entries.value = []
    knownIds.clear()
    for (const entry of history) append(entry)
    for (const entry of live) append(entry)
    error.value = ''
    if (autoFollow.value) await scrollToBottom()
  } catch (value) {
    error.value = value instanceof Error ? value.message : String(value)
  }
}
const openDirectory = async (): Promise<void> => {
  const result = await window.aiServiceApi.openLogDirectory()
  if (!result.success) error.value = result.message || t('aiService.openLogFailed')
}
const clearHistory = async (): Promise<void> => {
  try {
    await ElMessageBox.confirm(
      t('aiService.clearHistoryConfirm'),
      t('aiService.clearHistoryTitle'),
      {
        confirmButtonText: t('aiService.clearHistory'),
        cancelButtonText: t('common.cancel'),
        type: 'warning'
      }
    )
  } catch {
    return
  }
  try {
    await window.aiServiceApi.clearActivity()
    entries.value = []
    knownIds.clear()
    error.value = ''
  } catch (value) {
    error.value = value instanceof Error ? value.message : String(value)
  }
}
const methodLabel = (operation: string): string => {
  const key = `aiService.activity.methods.${operation}`
  return te(key) ? t(key) : operation
}
const detailLabel = (entry: AiActivityEntry): string => {
  const parts: string[] = []
  for (const [key, value] of Object.entries(entry.details || {}))
    parts.push(`${key}: ${String(value)}`)
  if (entry.errorCode) parts.push(`${t('aiService.activity.errorCode')}: ${entry.errorCode}`)
  return parts.join(' · ')
}
const formatTime = formatLocalTimestamp
const handleScroll = (): void => {
  const element = scrollContainer.value
  if (!element) return
  autoFollow.value = element.scrollHeight - element.scrollTop - element.clientHeight < 24
}
const scrollToBottom = async (): Promise<void> => {
  await nextTick()
  if (scrollContainer.value) scrollContainer.value.scrollTop = scrollContainer.value.scrollHeight
}
const scrollToLatest = (): void => {
  autoFollow.value = true
  void scrollToBottom()
}

onMounted(async () => {
  releaseRuntime = window.connectApi.onRuntimeEvent((event) => {
    const entry = fromRuntime(event)
    if (entry) append(entry)
  })
  await load()
})
onUnmounted(() => releaseRuntime?.())
defineExpose({ load })
</script>

<style scoped>
.activity-history {
  color: var(--settings-label-text, var(--text-primary));
}
.history-header,
.title-row,
.history-actions,
footer {
  display: flex;
  align-items: center;
}
.history-header {
  justify-content: space-between;
  gap: 12px;
}
.title-row {
  gap: 8px;
}
.title-row h3 {
  margin: 0;
  font-size: 14px;
}
.title-row span {
  padding: 2px 7px;
  border: 1px solid var(--settings-item-border, var(--border-primary));
  border-radius: 10px;
  color: var(--text-secondary);
  font-size: 10px;
}
.history-header p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
}
.history-actions {
  flex-shrink: 0;
  gap: 6px;
}
.history-actions button {
  box-sizing: border-box;
  width: auto !important;
  height: 26px;
  padding: 4px 10px !important;
  border-radius: 4px;
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
}
.log-file {
  margin-top: 9px;
  overflow: hidden;
  color: var(--text-secondary);
  font-family: Consolas, monospace;
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.entries {
  min-height: 120px;
  max-height: 310px;
  margin-top: 10px;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--settings-item-border, var(--border-primary));
  border-radius: 5px;
  background: var(--settings-group-bg, var(--bg-primary));
  outline: none;
}
.entries:focus {
  border-color: var(--focus-border-color, var(--el-color-primary));
}
.entry {
  padding: 8px 9px;
  border-left: 3px solid #77b98b;
  border-bottom: 1px solid var(--settings-item-border, var(--border-primary));
}
.entry.control {
  border-left-color: #e39a62;
}
.entry.failed {
  border-left-color: #df6e6e;
}
.entry:last-child {
  border-bottom: none;
}
.entry-header {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 10px;
}
.entry-header strong {
  color: #77b98b;
}
.entry.control .entry-header strong {
  color: #e39a62;
}
.entry.failed .entry-header strong,
.entry.failed .entry-header span {
  color: #df6e6e;
}
.entry-method {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 600;
}
.entry-detail {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 10px;
  line-height: 1.4;
  word-break: break-word;
}
.empty {
  padding: 44px 12px;
  color: var(--text-secondary);
  font-size: 12px;
  text-align: center;
}
.error {
  color: var(--color-danger);
  font-size: 11px;
}
footer {
  gap: 10px;
  margin-top: 7px;
  color: var(--text-secondary);
  font-size: 10px;
}
.follow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #77b98b;
}
.follow.paused {
  color: var(--text-secondary);
}
.follow i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.count {
  margin-left: auto;
}
.latest {
  padding: 0;
  border: 0;
  color: var(--el-color-primary);
  background: transparent;
  cursor: pointer;
}
</style>
