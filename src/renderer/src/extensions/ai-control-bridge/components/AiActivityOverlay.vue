<template>
  <Teleport to="body">
    <TransitionGroup
      name="ai-activity"
      tag="div"
      class="ai-activity-overlay"
      :class="positionClass"
      aria-live="polite"
    >
      <div
        v-for="item in items"
        :key="item.id"
        class="ai-activity-item"
        :class="[item.action, item.status, { clickable: settings.clickable }]"
        :style="{ opacity: String(settings.opacity / 100) }"
        @click="handleItemClick"
      >
        <button
          type="button"
          class="ai-activity-close"
          :aria-label="t('aiBridgeSettings.activity.close')"
          :title="t('aiBridgeSettings.activity.close')"
          @click.stop="handleItemClose(item.id)"
        >
          <span aria-hidden="true">×</span>
        </button>
        <div class="ai-activity-heading">
          <span class="ai-activity-action">{{ item.actionLabel }}</span>
          <span class="ai-activity-status">{{ item.statusLabel }}</span>
        </div>
        <div class="ai-activity-method">{{ item.methodLabel }}</div>
        <div v-if="item.detail" class="ai-activity-detail">{{ item.detail }}</div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiBridgeEvent } from '../../../../../shared/extensions/ai-control-bridge/AiBridgeEvents'

const { t } = useI18n()
const emit = defineEmits<{ 'open-history': [] }>()

type OverlayPosition =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

interface OverlaySettings {
  clickable: boolean
  opacity: number
  position: OverlayPosition
  duration: number
}

interface ActivityItem {
  id: number
  action: 'read' | 'control'
  status: 'success' | 'failed'
  actionLabel: string
  statusLabel: string
  methodLabel: string
  detail: string
}

const items = ref<ActivityItem[]>([])
const timers = new Map<number, ReturnType<typeof setTimeout>>()
const settings = ref<OverlaySettings>({
  clickable: true,
  opacity: 92,
  position: 'bottom-left',
  duration: 4
})
const positionClass = computed(() => `position-${settings.value.position}`)
let nextId = 0

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

const remove = (id: number): void => {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  items.value = items.value.filter((item) => item.id !== id)
}

const scheduleRemoval = (id: number): void => {
  const existingTimer = timers.get(id)
  if (existingTimer) clearTimeout(existingTimer)
  timers.delete(id)

  if (settings.value.duration <= 0) return
  timers.set(
    id,
    setTimeout(() => remove(id), settings.value.duration * 1000)
  )
}

const rescheduleRemovals = (): void => {
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
  items.value.forEach((item) => scheduleRemoval(item.id))
}

const applySettings = (value: unknown): void => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const input = value as Record<string, unknown>
  if (typeof input.aiActivityOverlayClickable === 'boolean') {
    settings.value.clickable = input.aiActivityOverlayClickable
  }
  if (
    typeof input.aiActivityOverlayOpacity === 'number' &&
    Number.isFinite(input.aiActivityOverlayOpacity)
  ) {
    settings.value.opacity = Math.min(100, Math.max(30, Math.round(input.aiActivityOverlayOpacity)))
  }
  if (
    typeof input.aiActivityOverlayPosition === 'string' &&
    input.aiActivityOverlayPosition in
      {
        'top-left': true,
        'top-center': true,
        'top-right': true,
        'middle-left': true,
        center: true,
        'middle-right': true,
        'bottom-left': true,
        'bottom-center': true,
        'bottom-right': true
      }
  ) {
    settings.value.position = input.aiActivityOverlayPosition as OverlayPosition
  }
  if (
    typeof input.aiActivityOverlayDuration === 'number' &&
    Number.isFinite(input.aiActivityOverlayDuration)
  ) {
    const duration = Math.round(input.aiActivityOverlayDuration)
    settings.value.duration =
      duration <= 0 || duration >= 16 ? 0 : Math.min(15, Math.max(1, duration))
  }
  rescheduleRemovals()
}

const handleSettingsUpdated = (event: Event): void => {
  applySettings((event as CustomEvent).detail)
}

const handleItemClick = (): void => {
  if (!settings.value.clickable) return
  emit('open-history')
  window.dispatchEvent(new CustomEvent('open-ai-activity-history'))
}

const handleItemClose = (id: number): void => {
  remove(id)
}

const show = (event: AiBridgeEvent): void => {
  if (event.eventType !== 'ai.activity' || event.source !== 'ai') return

  const payload = event.payload || {}
  const method = typeof payload.method === 'string' ? payload.method : 'unknown'
  const action = payload.action === 'read' ? 'read' : 'control'
  const status = payload.status === 'failed' ? 'failed' : 'success'
  const id = ++nextId
  const methodKey = `aiBridgeSettings.activity.methods.${method}`

  items.value.unshift({
    id,
    action,
    status,
    actionLabel: t(`aiBridgeSettings.activity.${action}`),
    statusLabel: t(`aiBridgeSettings.activity.${status}`),
    methodLabel: translated(methodKey, method),
    detail: buildDetail(payload.details, payload.errorCode)
  })

  if (items.value.length > 4) {
    const oldest = items.value.pop()
    if (oldest) remove(oldest.id)
  }

  scheduleRemoval(id)
}

onMounted(async () => {
  window.addEventListener('settings-updated', handleSettingsUpdated)
  try {
    applySettings(await window.storageApi.getSettings())
  } catch {
    // Defaults keep the overlay usable when settings are not available yet.
  }
})

onUnmounted(() => {
  window.removeEventListener('settings-updated', handleSettingsUpdated)
  timers.forEach((timer) => clearTimeout(timer))
  timers.clear()
})

defineExpose({ show, remove })
</script>

<style scoped>
.ai-activity-overlay {
  position: fixed;
  z-index: 10050;
  width: min(380px, calc(100vw - 32px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  pointer-events: none;
}

.ai-activity-overlay.position-top-left {
  top: 16px;
  left: 16px;
}

.ai-activity-overlay.position-top-center {
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
}

.ai-activity-overlay.position-top-right {
  top: 16px;
  right: 16px;
}

.ai-activity-overlay.position-middle-left {
  top: 50%;
  left: 16px;
  transform: translateY(-50%);
}

.ai-activity-overlay.position-center {
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
}

.ai-activity-overlay.position-middle-right {
  top: 50%;
  right: 16px;
  transform: translateY(-50%);
}

.ai-activity-overlay.position-bottom-left {
  bottom: 24px;
  left: 16px;
}

.ai-activity-overlay.position-bottom-center {
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
}

.ai-activity-overlay.position-bottom-right {
  right: 16px;
  bottom: 24px;
}

.ai-activity-item {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  padding: 9px 44px 9px 12px;
  border: 1px solid var(--notify-border);
  border-left: 4px solid #77b98b;
  border-radius: 7px;
  background: var(--notify-bg);
  box-shadow: var(--notify-shadow);
  color: var(--notify-text);
  opacity: 0.96;
  pointer-events: none;
}

.ai-activity-item.clickable {
  pointer-events: auto;
  cursor: pointer;
}

.ai-activity-item.clickable:hover {
  filter: brightness(1.06);
}

.ai-activity-close {
  position: absolute;
  top: 3px;
  right: 3px;
  z-index: 1;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--notify-meta);
  font: inherit;
  pointer-events: auto;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease,
    transform 0.15s ease;
}

.ai-activity-close span {
  position: relative;
  display: block;
  width: 14px;
  height: 14px;
  font-size: 0;
}

.ai-activity-close span::before,
.ai-activity-close span::after {
  position: absolute;
  top: 6px;
  left: 0;
  width: 14px;
  height: 1.5px;
  border-radius: 1px;
  background: currentColor;
  content: '';
}

.ai-activity-close span::before {
  transform: rotate(45deg);
}

.ai-activity-close span::after {
  transform: rotate(-45deg);
}

.ai-activity-close:hover {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  transform: scale(1.04);
}

.ai-activity-close:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: 1px;
}

.ai-activity-item.control {
  border-left-color: #e39a62;
}

.ai-activity-item.failed {
  border-left-color: #df6e6e;
}

.ai-activity-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  line-height: 1.3;
}

.ai-activity-action {
  font-weight: 700;
}

.ai-activity-item.read .ai-activity-action {
  color: #77b98b;
}

.ai-activity-item.control .ai-activity-action {
  color: #e39a62;
}

.ai-activity-item.failed .ai-activity-action,
.ai-activity-item.failed .ai-activity-status {
  color: #df6e6e;
}

.ai-activity-status {
  color: var(--notify-meta);
}

.ai-activity-method {
  margin-top: 3px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.ai-activity-detail {
  margin-top: 2px;
  color: var(--notify-empty);
  font-size: 11px;
  line-height: 1.4;
  word-break: break-word;
}

.ai-activity-enter-active,
.ai-activity-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.ai-activity-enter-from,
.ai-activity-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
