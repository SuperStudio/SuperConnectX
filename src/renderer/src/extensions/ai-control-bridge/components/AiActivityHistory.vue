<template>
  <section class="ai-activity-history" aria-readonly="true">
    <div class="ai-activity-history-header">
      <div>
        <div class="ai-activity-history-title-row">
          <h3>{{ t('aiBridgeSettings.activityHistoryTitle') }}</h3>
          <span class="ai-activity-history-readonly">{{
            t('aiBridgeSettings.activityHistoryReadOnly')
          }}</span>
        </div>
        <p>{{ t('aiBridgeSettings.activityHistoryDesc') }}</p>
      </div>
      <div class="ai-activity-history-actions">
        <el-button size="small" @click="loadHistory">{{
          t('aiBridgeSettings.activityHistoryRefresh')
        }}</el-button>
        <el-button size="small" class="btn-primary" @click="openLogDirectory">
          {{ t('aiBridgeSettings.activityHistoryOpenFolder') }}
        </el-button>
      </div>
    </div>

    <div v-if="logInfo?.filePath" class="ai-activity-history-file">
      {{ t('aiBridgeSettings.activityHistoryFile', { path: logInfo.filePath }) }}
    </div>

    <div ref="scrollContainer" class="ai-activity-history-list" tabindex="0" @scroll="handleScroll">
      <div v-if="items.length === 0" class="ai-activity-history-empty">
        {{ t('aiBridgeSettings.activityHistoryEmpty') }}
      </div>
      <article
        v-for="item in items"
        :key="item.key"
        class="ai-activity-history-item"
        :class="[item.action, item.status]"
      >
        <div class="ai-activity-history-item-header">
          <time>{{ formatTime(item.timestamp) }}</time>
          <span class="ai-activity-history-action">{{ item.actionLabel }}</span>
          <span class="ai-activity-history-status">{{ item.statusLabel }}</span>
          <span class="ai-activity-history-sequence">#{{ item.sequence }}</span>
        </div>
        <div class="ai-activity-history-method">{{ item.methodLabel }}</div>
        <div v-if="item.detail" class="ai-activity-history-detail">{{ item.detail }}</div>
      </article>
    </div>

    <div class="ai-activity-history-footer">
      <span class="ai-activity-history-follow" :class="{ paused: !autoFollow }">
        <span class="ai-activity-history-follow-dot"></span>
        {{
          autoFollow
            ? t('aiBridgeSettings.activityHistoryLive')
            : t('aiBridgeSettings.activityHistoryPaused')
        }}
      </span>
      <span class="ai-activity-history-count">{{
        t('aiBridgeSettings.activityHistoryCount', { count: items.length })
      }}</span>
      <el-button v-if="!autoFollow" size="small" text type="primary" @click="scrollToLatest">
        {{ t('aiBridgeSettings.activityHistoryReturnLatest') }}
      </el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import type { AiBridgeEvent } from '../../../../../shared/extensions/ai-control-bridge/AiBridgeEvents'

const { t } = useI18n()

interface ActivityItem {
  key: string
  sequence: number
  timestamp: string
  action: 'read' | 'control'
  status: 'success' | 'failed'
  actionLabel: string
  statusLabel: string
  methodLabel: string
  detail: string
}

interface AiActivityLogInfo {
  filePath: string
  directory: string
}

const items = ref<ActivityItem[]>([])
const autoFollow = ref(true)
const scrollContainer = ref<HTMLElement | null>(null)
const logInfo = ref<AiActivityLogInfo | null>(null)
let removeBridgeEventListener: (() => void) | null = null
const knownKeys = new Set<string>()

const translated = (key: string, fallback: string): string => {
  const value = t(key)
  return value === key ? fallback : value
}

const buildDetail = (
  details: Record<string, unknown> | undefined,
  errorCode: string | undefined
): string => {
  const parts: string[] = []
  if (typeof details?.command === 'string') {
    parts.push(t('aiBridgeSettings.activity.details.command', { command: details.command }))
  } else if (typeof details?.domain === 'string') {
    parts.push(t('aiBridgeSettings.activity.details.domain', { domain: details.domain }))
  }
  if (typeof details?.fields === 'string') {
    parts.push(t('aiBridgeSettings.activity.details.fields', { fields: details.fields }))
  }
  if (typeof details?.sessionId === 'string') {
    parts.push(t('aiBridgeSettings.activity.details.session', { sessionId: details.sessionId }))
  }
  if (typeof details?.portPath === 'string' || typeof details?.portPath === 'number') {
    parts.push(
      t('aiBridgeSettings.activity.details.portPath', { portPath: String(details.portPath) })
    )
  }
  if (typeof details?.name === 'string') {
    parts.push(t('aiBridgeSettings.activity.details.name', { name: details.name }))
  }
  if (errorCode) {
    parts.push(t('aiBridgeSettings.activity.details.error', { code: errorCode }))
  }
  return parts.join(' · ')
}

const toItem = (event: AiBridgeEvent): ActivityItem | null => {
  if (event.eventType !== 'ai.activity' || event.source !== 'ai') return null
  const payload = event.payload || {}
  const method = typeof payload.method === 'string' ? payload.method : 'unknown'
  const action = payload.action === 'read' ? 'read' : 'control'
  const status = payload.status === 'failed' ? 'failed' : 'success'
  const sequence = typeof event.sequence === 'number' ? event.sequence : 0
  const timestamp = typeof event.timestamp === 'string' ? event.timestamp : new Date().toISOString()
  return {
    key: event.eventId || `${sequence}-${timestamp}-${method}`,
    sequence,
    timestamp,
    action,
    status,
    actionLabel: t(`aiBridgeSettings.activity.${action}`),
    statusLabel: t(`aiBridgeSettings.activity.${status}`),
    methodLabel: translated(`aiBridgeSettings.activity.methods.${method}`, method),
    detail: buildDetail(payload.details, payload.errorCode)
  }
}

const appendEvent = (event: AiBridgeEvent): void => {
  const item = toItem(event)
  if (!item || knownKeys.has(item.key)) return
  knownKeys.add(item.key)
  items.value.push(item)
  if (items.value.length > 500) items.value.splice(0, items.value.length - 500)
  if (autoFollow.value) void scrollToBottom()
}

const loadHistory = async (): Promise<void> => {
  try {
    const history = await window.aiActivityApi.getHistory(500)
    const liveItems = items.value.slice()
    items.value = []
    knownKeys.clear()
    for (const event of history || []) appendEvent(event)
    for (const item of liveItems) {
      if (!knownKeys.has(item.key)) {
        knownKeys.add(item.key)
        items.value.push(item)
      }
    }
    await nextTick()
    if (autoFollow.value) await scrollToBottom()
  } catch (error) {
    console.error('Failed to load AI activity history:', error)
    ElMessage.error(t('aiBridgeSettings.activityHistoryLoadFailed'))
  }
}

const formatTime = (timestamp: string): string => {
  return timestamp.replace('T', ' ').replace('Z', '')
}

const handleScroll = (): void => {
  const element = scrollContainer.value
  if (!element) return
  const distanceToBottom = element.scrollHeight - element.scrollTop - element.clientHeight
  autoFollow.value = distanceToBottom < 24
}

const scrollToBottom = async (): Promise<void> => {
  await nextTick()
  const element = scrollContainer.value
  if (element) element.scrollTop = element.scrollHeight
}

const scrollToLatest = (): void => {
  autoFollow.value = true
  void scrollToBottom()
}

const openLogDirectory = async (): Promise<void> => {
  const result = await window.aiActivityApi.openLogDirectory()
  if (result.success) {
    ElMessage.success(t('aiBridgeSettings.activityHistoryOpenSuccess'))
  } else {
    ElMessage.error(
      t('aiBridgeSettings.activityHistoryOpenFailed', { message: result.message || '' })
    )
  }
}

const loadLogInfo = async (): Promise<void> => {
  try {
    logInfo.value = await window.aiActivityApi.getLogInfo()
  } catch (error) {
    console.error('Failed to load AI activity log information:', error)
  }
}

const handleBridgeEvent = (event: AiBridgeEvent): void => {
  if (event.eventType === 'config.changed' && event.payload?.domain === 'settings') {
    void loadLogInfo()
  }
  appendEvent(event)
}

const focusHistory = (): void => {
  autoFollow.value = true
  void scrollToLatest()
  scrollContainer.value?.focus()
}

onMounted(async () => {
  removeBridgeEventListener = window.connectApi.onBridgeEvent(handleBridgeEvent)
  window.addEventListener('open-ai-activity-history', focusHistory)
  await loadLogInfo()
  await loadHistory()
})

onUnmounted(() => {
  removeBridgeEventListener?.()
  removeBridgeEventListener = null
  window.removeEventListener('open-ai-activity-history', focusHistory)
})

defineExpose({ focusHistory, loadHistory })
</script>

<style scoped>
.ai-activity-history {
  color: var(--settings-label-text);
}

.ai-activity-history-header,
.ai-activity-history-title-row,
.ai-activity-history-actions,
.ai-activity-history-footer {
  display: flex;
  align-items: center;
}

.ai-activity-history-header {
  justify-content: space-between;
  gap: 12px;
}

.ai-activity-history-title-row {
  gap: 8px;
}

.ai-activity-history-title-row h3 {
  margin: 0;
  font-size: 14px;
  color: var(--settings-label-text);
}

.ai-activity-history-readonly {
  color: var(--settings-label-desc);
  font-size: 10px;
  border: 1px solid var(--settings-item-border);
  border-radius: 10px;
  padding: 2px 7px;
}

.ai-activity-history-header p {
  margin: 5px 0 0;
  color: var(--settings-label-desc);
  font-size: 11px;
  line-height: 1.5;
}

.ai-activity-history-actions {
  flex-shrink: 0;
  gap: 6px;
}

.ai-activity-history-file {
  margin-top: 9px;
  color: var(--settings-label-desc);
  font-family: Consolas, monospace;
  font-size: 10px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-activity-history-list {
  max-height: 310px;
  min-height: 120px;
  margin-top: 10px;
  padding: 4px;
  overflow-y: auto;
  border: 1px solid var(--settings-item-border);
  border-radius: 5px;
  background: var(--settings-group-bg);
  outline: none;
}

.ai-activity-history-list:focus {
  border-color: var(--focus-border-color);
}

.ai-activity-history-item {
  padding: 8px 9px;
  border-left: 3px solid #77b98b;
  border-bottom: 1px solid var(--settings-item-border);
}

.ai-activity-history-item:last-child {
  border-bottom: none;
}

.ai-activity-history-item.control {
  border-left-color: #e39a62;
}

.ai-activity-history-item.failed {
  border-left-color: #df6e6e;
}

.ai-activity-history-item-header {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--settings-label-desc);
  font-size: 10px;
}

.ai-activity-history-action {
  color: #77b98b;
  font-weight: 700;
}

.ai-activity-history-item.control .ai-activity-history-action {
  color: #e39a62;
}

.ai-activity-history-item.failed .ai-activity-history-action,
.ai-activity-history-item.failed .ai-activity-history-status {
  color: #df6e6e;
}

.ai-activity-history-sequence {
  margin-left: auto;
  opacity: 0.7;
}

.ai-activity-history-method {
  margin-top: 3px;
  font-size: 12px;
  font-weight: 600;
}

.ai-activity-history-detail {
  margin-top: 2px;
  color: var(--settings-label-desc);
  font-size: 10px;
  line-height: 1.4;
  word-break: break-word;
}

.ai-activity-history-empty {
  padding: 44px 12px;
  color: var(--settings-label-desc);
  font-size: 12px;
  text-align: center;
}

.ai-activity-history-footer {
  gap: 10px;
  margin-top: 7px;
  color: var(--settings-label-desc);
  font-size: 10px;
}

.ai-activity-history-follow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: #77b98b;
}

.ai-activity-history-follow.paused {
  color: var(--settings-label-desc);
}

.ai-activity-history-follow-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.ai-activity-history-count {
  margin-left: auto;
}
</style>
