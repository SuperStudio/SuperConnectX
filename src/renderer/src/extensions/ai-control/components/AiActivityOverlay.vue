<template>
  <Teleport to="body">
    <TransitionGroup name="ai-activity" tag="div" :class="['ai-activity-overlay', `position-${overlayPosition}`]" aria-live="polite">
      <div v-for="item in items" :key="item.id" :class="['ai-activity-item', item.action, item.status, { clickable: overlayClickable }]" :style="{ opacity: overlayOpacity }" @click="openHistory">
        <button type="button" class="ai-activity-close" :aria-label="t('aiService.activity.close')" @click.stop="remove(item.id)"><span></span></button>
        <div class="ai-activity-heading"><span class="ai-activity-action">{{ t(`aiService.activity.${item.action}`) }}</span><span class="ai-activity-status">{{ t(`aiService.activity.${item.status}`) }}</span></div>
        <div class="ai-activity-method">{{ methodLabel(item.operation) }}</div>
        <div v-if="item.detail" class="ai-activity-detail">{{ item.detail }}</div>
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiConfigDocument, AiOverlayPosition } from '../../../../../shared/extensions/ai-control/AiConfigTypes'
import type { RuntimeUiEvent } from '../../../../../shared/extensions/ai-control/AiServiceTypes'

interface OverlayItem { id: string; operation: string; action: 'read' | 'control'; status: 'success' | 'failed'; detail: string }
const emit = defineEmits<{ (event: 'open-history'): void }>()
const { t, te } = useI18n()
const items = ref<OverlayItem[]>([])
const overlayClickable = ref(true)
const overlayOpacity = ref(0.9)
const overlayPosition = ref<AiOverlayPosition>('bottom-left')
const overlayDuration = ref(4)
const timers = new Map<string, ReturnType<typeof setTimeout>>()
let releaseConfig: (() => void) | undefined
let fallbackId = 0

const methodLabel = (operation: string): string => { const key = `aiService.activity.methods.${operation}`; return te(key) ? t(key) : operation }
const buildDetail = (payload: Record<string, unknown>): string => {
  const parts: string[] = []
  const details = payload.details && typeof payload.details === 'object' ? payload.details as Record<string, unknown> : {}
  if (typeof payload.clientName === 'string') parts.push(payload.clientName)
  for (const key of ['command', 'domain', 'sessionId', 'connectionId']) if (details[key] !== undefined) parts.push(`${key}: ${String(details[key])}`)
  if (typeof payload.errorCode === 'string') parts.push(`${t('aiService.activity.errorCode')}: ${payload.errorCode}`)
  return parts.join(' · ')
}
const remove = (id: string): void => {
  const timer = timers.get(id); if (timer) clearTimeout(timer); timers.delete(id)
  items.value = items.value.filter((item) => item.id !== id)
}
const scheduleRemoval = (id: string): void => {
  const timer = timers.get(id)
  if (timer) clearTimeout(timer)
  timers.delete(id)
  if (overlayDuration.value <= 0) return
  timers.set(id, setTimeout(() => remove(id), overlayDuration.value * 1000))
}
const rescheduleRemovals = (): void => {
  timers.forEach(clearTimeout)
  timers.clear()
  for (const item of items.value) scheduleRemoval(item.id)
}
const applyConfig = (config: AiConfigDocument): void => {
  const activity = config.shared.activity
  overlayClickable.value = activity.overlayClickable
  overlayOpacity.value = activity.overlayOpacity
  overlayPosition.value = activity.overlayPosition
  overlayDuration.value = activity.overlayDuration
  rescheduleRemovals()
}
const openHistory = (): void => {
  if (overlayClickable.value) emit('open-history')
}
const show = (event: RuntimeUiEvent): void => {
  if (event.eventType !== 'ai.activity' || event.source !== 'ai') return
  const payload = event.payload || {}
  const id = event.eventId || `activity-${++fallbackId}`
  items.value.unshift({ id, operation: typeof payload.method === 'string' ? payload.method : 'unknown', action: payload.action === 'read' ? 'read' : 'control', status: payload.status === 'failed' ? 'failed' : 'success', detail: buildDetail(payload) })
  if (items.value.length > 4) remove(items.value[items.value.length - 1].id)
  scheduleRemoval(id)
}
onMounted(async () => {
  applyConfig(await window.aiServiceApi.getConfig())
  releaseConfig = window.aiServiceApi.onConfigChanged(applyConfig)
})
onUnmounted(() => { releaseConfig?.(); timers.forEach(clearTimeout); timers.clear() })
defineExpose({ show, remove })
</script>

<style scoped>
.ai-activity-overlay{position:fixed;z-index:10050;width:min(380px,calc(100vw - 32px));display:flex;flex-direction:column;gap:8px;pointer-events:none}.position-top-left{top:16px;left:16px}.position-top-center{top:16px;left:50%;transform:translateX(-50%)}.position-top-right{top:16px;right:16px}.position-middle-left{top:50%;left:16px;transform:translateY(-50%)}.position-center{top:50%;left:50%;transform:translate(-50%,-50%)}.position-middle-right{top:50%;right:16px;transform:translateY(-50%)}.position-bottom-left{bottom:24px;left:16px}.position-bottom-center{bottom:24px;left:50%;transform:translateX(-50%)}.position-bottom-right{right:16px;bottom:24px}.ai-activity-item{position:relative;width:100%;box-sizing:border-box;padding:9px 44px 9px 12px;border:1px solid var(--notify-border);border-left:4px solid #77b98b;border-radius:7px;background:var(--notify-bg);box-shadow:var(--notify-shadow);color:var(--notify-text);pointer-events:none}.ai-activity-item.clickable{pointer-events:auto;cursor:pointer}.ai-activity-item.clickable:hover{filter:brightness(1.06)}.ai-activity-item.control{border-left-color:#e39a62}.ai-activity-item.failed{border-left-color:#df6e6e}.ai-activity-close{position:absolute;top:3px;right:3px;width:32px;height:32px;display:inline-flex;align-items:center;justify-content:center;padding:0;border:1px solid transparent;border-radius:7px;background:transparent;color:var(--notify-meta);pointer-events:auto;cursor:pointer}.ai-activity-close span,.ai-activity-close span:before,.ai-activity-close span:after{display:block}.ai-activity-close span{position:relative;width:14px;height:14px}.ai-activity-close span:before,.ai-activity-close span:after{position:absolute;top:6px;left:0;width:14px;height:1.5px;border-radius:1px;background:currentColor;content:''}.ai-activity-close span:before{transform:rotate(45deg)}.ai-activity-close span:after{transform:rotate(-45deg)}.ai-activity-close:hover{background:rgba(255,255,255,.1);color:#fff}.ai-activity-heading{display:flex;align-items:center;gap:8px;font-size:11px}.ai-activity-action{font-weight:700}.ai-activity-item.read .ai-activity-action{color:#77b98b}.ai-activity-item.control .ai-activity-action{color:#e39a62}.ai-activity-item.failed .ai-activity-action,.ai-activity-item.failed .ai-activity-status{color:#df6e6e}.ai-activity-status{color:var(--notify-meta)}.ai-activity-method{margin-top:3px;font-size:13px;font-weight:600}.ai-activity-detail{margin-top:2px;color:var(--notify-empty);font-size:11px;line-height:1.4;word-break:break-word}.ai-activity-enter-active,.ai-activity-leave-active{transition:opacity .25s ease,transform .25s ease}.ai-activity-enter-from,.ai-activity-leave-to{opacity:0;transform:translateY(-8px)}
</style>
