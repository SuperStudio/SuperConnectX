<template>
  <div class="ai-service-page">
    <div class="ai-service-content">
      <header class="page-header">
        <div><h2>{{ t('aiService.title') }}</h2><p>{{ t('aiService.subtitle') }}</p></div>
        <button class="btn-primary header-action" @click="showHelp = !showHelp">{{ t('aiService.usage') }}</button>
      </header>

      <section v-if="showHelp" class="group-section help-section">
        <div class="group-title">{{ t('aiService.usage') }}</div>
        <p>{{ t('aiService.usageText') }}</p>
        <ol><li>{{ t('aiService.stepEnable') }}</li><li>{{ t('aiService.stepCopy') }}</li><li>{{ t('aiService.stepConnect') }}</li></ol>
        <p class="security-note">{{ t('aiService.startupPermissionNote') }}</p>
      </section>

      <p v-if="error" class="error-message">{{ error }}</p>
      <template v-if="status && config">
        <section class="group-section">
          <div class="group-title">{{ t('aiService.bridgeOverview') }}</div>
          <div :class="['bridge-status-badge', bridgeStatusClass]">
            <span class="status-dot"></span><strong>{{ bridgeStatusText }}</strong>
            <span class="service-state">{{ t('aiService.state') }}：{{ serviceStateText }}</span>
          </div>
          <div class="setting-item">
            <div class="setting-label"><span class="label-text">{{ t('aiService.bridgeEnabled') }}</span><span class="label-desc">{{ t('aiService.bridgeEnabledDesc') }}</span></div>
            <el-switch :model-value="instance.enabled" @change="toggleEnabled" />
          </div>
          <div class="setting-item">
            <div class="setting-label"><span class="label-text">{{ t('aiService.permission') }}</span><span class="label-desc">{{ t('aiService.permissionDesc') }}</span></div>
            <select class="compact-control" :aria-label="t('aiService.permission')" :value="status.permission" @change="setPermission(($event.target as HTMLSelectElement).value)">
              <option value="read-only">{{ t('aiService.readOnly') }}</option><option value="full-control">{{ t('aiService.fullControl') }}</option>
            </select>
          </div>
          <div class="setting-item">
            <div class="setting-label"><span class="label-text">{{ t('aiService.aiAccess') }}</span><span class="label-desc">{{ t('aiService.aiAccessDesc') }}</span></div>
            <div :class="['client-indicator', { connected: status.clientCount > 0 }]"><span class="status-dot"></span><span>{{ clientIndicatorText }}</span></div>
          </div>
          <div class="service-facts">
            <div class="service-facts-title">{{ t('aiService.mcpConfig') }}</div>
            <div><span>{{ t('aiService.endpoint') }}</span><code :title="status.endpoint || '-'">{{ status.endpoint || '-' }}</code></div>
            <div><span>{{ t('aiService.instanceId') }}</span><strong>{{ status.instanceIndex + 1 }} {{ status.instanceAlias }}</strong></div>
            <div><span>{{ t('aiService.port') }}</span><strong>{{ status.port || '-' }}</strong></div>
            <div><span>{{ t('aiService.tokenFingerprint') }}</span><code>{{ status.tokenFingerprint || '-' }}</code></div>
          </div>
          <p v-if="status.lastError" class="error-message compact">{{ t('aiService.lastError') }}：{{ status.lastError }}</p>
        </section>

        <section class="group-section action-section">
          <div class="action-grid">
            <button class="btn-primary" @click="toggleEnabled">{{ instance.enabled ? t('aiService.disable') : t('aiService.enable') }}</button>
            <button class="btn-primary" :disabled="status.state !== 'running'" @click="copyConfig">{{ t('aiService.copyMcpConfig') }}</button>
            <button class="btn-primary" :disabled="status.state !== 'running'" @click="runTest">{{ t('aiService.selfTest') }}</button>
            <button class="btn-primary" @click="rotateToken">{{ t('aiService.rotateToken') }}</button>
          </div>
          <p v-if="message" class="success-message">{{ message }}</p>
        </section>

        <section class="group-section">
          <div class="group-title">{{ t('aiService.capabilities') }}</div>
          <p class="section-desc">{{ t('aiService.capabilitiesDesc') }}</p>
          <div class="capability-list">
            <article v-for="capability in capabilityDefinitions" :key="capability.key" class="capability-item">
              <div class="capability-header">
                <strong>{{ t(`aiService.capability.${capability.key}.title`) }}</strong>
                <div class="capability-actions">
                  <el-switch :model-value="config.shared.capabilityGroups[capability.key]" :title="t('aiService.capabilityToggleHint')" @change="setCapability(capability.key, Boolean($event))" />
                  <span :class="['capability-status', capabilityState(capability)]">{{ capabilityStateText(capability) }}</span>
                </div>
              </div>
              <p>{{ t(`aiService.capability.${capability.key}.description`) }}</p>
              <div class="operation-interfaces"><span>{{ t('aiService.operationInterfaces') }}</span><code>{{ capability.methods.join(', ') }}</code></div>
            </article>
          </div>
        </section>

        <section class="group-section">
          <div class="group-title">{{ t('aiService.instanceSettings') }}</div><p class="section-desc">{{ t('aiService.instanceSettingsDesc') }}</p>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.basePort') }}</span><span class="label-desc">{{ t('aiService.basePortDesc') }}</span></div><input class="compact-control" type="number" :value="config.shared.basePort" min="1024" max="65535" @change="setBasePort(Number(($event.target as HTMLInputElement).value))" /></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.alias') }}</span><span class="label-desc">{{ t('aiService.aliasDesc') }}</span></div><input class="compact-control" :value="instance.alias" @change="setAlias(($event.target as HTMLInputElement).value)" /></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.portOverride') }}</span><span class="label-desc">{{ t('aiService.portOverrideDesc') }}</span></div><input class="compact-control" type="number" :value="instance.portOverride ?? ''" min="1024" max="65535" :placeholder="t('aiService.portOverrideAuto')" @change="setPortOverride(($event.target as HTMLInputElement).value)" /></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.allowAiCloseUserConnection') }}</span><span class="label-desc">{{ t('aiService.allowAiCloseUserConnectionDesc') }}</span></div><el-switch :model-value="config.shared.allowAiCloseUserConnection" @change="setAllowAiCloseUserConnection(Boolean($event))" /></div>
        </section>

        <section class="group-section">
          <div class="group-title">{{ t('aiService.feedbackTitle') }}</div><p class="section-desc">{{ t('aiService.feedbackDesc') }}</p>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.overlayClickable') }}</span><span class="label-desc">{{ t('aiService.overlayClickableDesc') }}</span></div><el-switch :model-value="config.shared.activity.overlayClickable" @change="setActivity('overlayClickable', Boolean($event))" /></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.overlayPosition') }}</span><span class="label-desc">{{ t('aiService.overlayPositionDesc') }}</span></div><select class="compact-control" :aria-label="t('aiService.overlayPosition')" :value="config.shared.activity.overlayPosition" @change="setActivity('overlayPosition', ($event.target as HTMLSelectElement).value as AiOverlayPosition)"><option v-for="position in overlayPositions" :key="position" :value="position">{{ t(`aiService.position.${position}`) }}</option></select></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.overlayOpacity') }}</span><span class="label-desc">{{ t('aiService.overlayOpacityDesc') }}</span></div><div class="range-control"><input type="range" :aria-label="t('aiService.overlayOpacity')" min="0.2" max="1" step="0.05" :value="config.shared.activity.overlayOpacity" @change="setActivity('overlayOpacity', Number(($event.target as HTMLInputElement).value))" /><span>{{ Math.round(config.shared.activity.overlayOpacity * 100) }}%</span></div></div>
          <div class="setting-item">
            <div class="setting-label">
              <span class="label-text">{{ t('aiService.overlayDuration') }}</span>
              <span class="label-desc">{{ t('aiService.overlayDurationDesc') }}</span>
            </div>
            <div :class="['range-control', 'duration-control', { permanent: isOverlayDurationPermanent }]">
              <el-slider
                :model-value="overlayDurationSlider"
                :aria-label="t('aiService.overlayDuration')"
                :min="1"
                :max="16"
                :step="1"
                :marks="overlayDurationMarks"
                :show-tooltip="false"
                class="duration-slider"
                @input="setOverlayDurationDraft($event)"
                @change="commitOverlayDuration($event)"
              />
              <span class="duration-value">{{ isOverlayDurationPermanent ? t('aiService.permanent') : `${overlayDurationSlider} ${t('aiService.seconds')}` }}</span>
            </div>
          </div>
        </section>

        <section class="group-section">
          <div class="group-title">{{ t('aiService.activityLogTitle') }}</div><p class="section-desc">{{ t('aiService.activityLogDesc') }}</p>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.commandContentMode') }}</span><span class="label-desc">{{ t('aiService.commandContentModeDesc') }}</span></div><select class="compact-control" :aria-label="t('aiService.commandContentMode')" :value="config.shared.activity.commandContentMode" @change="setActivity('commandContentMode', ($event.target as HTMLSelectElement).value as AiCommandContentMode)"><option value="none">{{ t('aiService.commandModeNone') }}</option><option value="preview">{{ t('aiService.commandModePreview') }}</option><option value="full">{{ t('aiService.commandModeFull') }}</option></select></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.logDirectory') }}</span><span class="label-desc">{{ t('aiService.logDirectoryDesc') }}</span></div><div class="path-control"><code :title="displayLogDirectory">{{ displayLogDirectory }}</code><button class="btn-primary path-button" @click="chooseLogDirectory">{{ t('aiService.chooseLogDirectory') }}</button></div></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.logMaxSize') }}</span><span class="label-desc">{{ t('aiService.logMaxSizeDesc') }}</span></div><div class="range-control"><input type="range" min="1" max="100" step="1" :value="config.shared.activity.logMaxSizeMb" @change="setActivity('logMaxSizeMb', Number(($event.target as HTMLInputElement).value))" /><span>{{ config.shared.activity.logMaxSizeMb }} MiB</span></div></div>
          <div class="setting-item"><div class="setting-label"><span class="label-text">{{ t('aiService.logMaxFiles') }}</span><span class="label-desc">{{ t('aiService.logMaxFilesDesc') }}</span></div><div class="range-control"><input type="range" min="1" max="10" step="1" :value="config.shared.activity.logMaxFiles" @change="setActivity('logMaxFiles', Number(($event.target as HTMLInputElement).value))" /><span>{{ config.shared.activity.logMaxFiles }} {{ t('aiService.files') }}</span></div></div>
        </section>

        <section v-if="view === 'history' || view === 'overview'" class="group-section"><AiActivityHistory :log-directory="displayLogDirectory" /></section>
      </template>
      <p v-else-if="loading" class="loading">{{ t('aiService.loading') }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { AiCapabilityGroups, AiCommandContentMode, AiOverlayPosition, AiSharedConfig, AiPermission } from '../../../../../shared/extensions/ai-control/AiConfigTypes'
import AiActivityHistory from './AiActivityHistory.vue'
import { useAiService } from '../composables/useAiService'

type CapabilityAccess = 'read' | 'write' | 'mixed'
interface CapabilityDefinition { key: keyof AiCapabilityGroups; access: CapabilityAccess; methods: string[] }
const props = withDefaults(defineProps<{ view?: 'overview' | 'history' }>(), { view: 'overview' })
const { t } = useI18n()
const { status, config, loading, error, save, selfTest } = useAiService()
const showHelp = ref(false), message = ref('')
const view = computed(() => props.view)
const capabilityDefinitions: CapabilityDefinition[] = [
  { key: 'sessionRead', access: 'read', methods: ['server_get_info', 'serial_list_ports', 'session_list', 'session_read_events', 'session_read_buffer', 'session_wait_events', 'session_wait_pattern'] },
  { key: 'serialWrite', access: 'write', methods: ['session_acquire_write', 'session_release_write', 'session_send', 'session_send_and_wait'] },
  { key: 'sessionManage', access: 'write', methods: ['session_start_saved', 'session_start_port', 'session_stop'] },
  { key: 'connectionManage', access: 'mixed', methods: ['connection_list', 'connection_create', 'connection_update', 'connection_delete'] },
  { key: 'commandManage', access: 'mixed', methods: ['command_group_list', 'command_group_create', 'command_group_update', 'command_group_delete', 'preset_command_list', 'preset_command_create', 'preset_command_update', 'preset_command_delete'] },
  { key: 'configManage', access: 'mixed', methods: ['config_describe', 'config_get', 'config_patch'] },
  { key: 'auditRead', access: 'read', methods: ['log_read_tail', 'log_search', 'activity_read'] }
]
const overlayPositions: AiOverlayPosition[] = ['top-left', 'top-center', 'top-right', 'middle-left', 'center', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']
const instance = computed(() => config.value!.instances[String(status.value!.instanceIndex)])
const displayLogDirectory = computed(() => config.value?.shared.activity.logRoot || t('aiService.logDirectoryDefault'))
const bridgeStatusClass = computed(() => !instance.value.enabled ? 'disabled' : status.value!.permission === 'full-control' ? 'full-control' : 'read-only')
const bridgeStatusText = computed(() => !instance.value.enabled ? t('aiService.disabledStatus') : status.value!.permission === 'full-control' ? t('aiService.enabledFullControlStatus') : t('aiService.enabledReadOnlyStatus'))
const serviceStateText = computed(() => t(`aiService.serviceState.${status.value!.state}`))
const clientIndicatorText = computed(() => status.value!.clientCount > 0 ? t('aiService.clientConnected') : t('aiService.clientDisconnected'))
const overlayDurationSlider = ref(4)
watch(
  () => config.value?.shared.activity.overlayDuration,
  (duration) => {
    if (typeof duration !== 'number' || !Number.isFinite(duration)) return
    overlayDurationSlider.value = duration <= 0 ? 16 : Math.min(15, Math.max(1, Math.round(duration)))
  },
  { immediate: true }
)
const isOverlayDurationPermanent = computed(() => overlayDurationSlider.value >= 16)
const overlayDurationMarks = { 15: '', 16: '' }
const capabilityState = (item: CapabilityDefinition): 'available' | 'readable' | 'unavailable' => {
  if (!instance.value.enabled || !config.value!.shared.capabilityGroups[item.key]) return 'unavailable'
  if (status.value!.permission === 'full-control' || item.access === 'read') return 'available'
  return item.access === 'mixed' ? 'readable' : 'unavailable'
}
const capabilityStateText = (item: CapabilityDefinition): string => capabilityState(item) === 'available' ? t('aiService.available') : capabilityState(item) === 'readable' ? t('aiService.readOnlyAvailable') : t('aiService.unavailable')
const toggleEnabled = (): Promise<void> => save({ instance: { enabled: !instance.value.enabled } })
const setPermission = async (value: string): Promise<void> => { status.value = await window.aiServiceApi.setPermission(value as AiPermission) }
const setBasePort = async (value: number): Promise<void> => { if (value !== config.value?.shared.basePort && window.confirm(t('aiService.basePortConfirm'))) await save({ shared: { basePort: value } }) }
const setAlias = (value: string): Promise<void> => save({ instance: { alias: value } })
const setPortOverride = (value: string): Promise<void> => save({ instance: { portOverride: value.trim() ? Number(value) : null } })
const setAllowAiCloseUserConnection = (value: boolean): Promise<void> => save({ shared: { allowAiCloseUserConnection: value } })
const setCapability = (key: keyof AiCapabilityGroups, value: boolean): Promise<void> => save({ shared: { capabilityGroups: { [key]: value } } })
const setActivity = <K extends keyof AiSharedConfig['activity']>(key: K, value: AiSharedConfig['activity'][K]): Promise<void> => save({ shared: { activity: { [key]: value } } })
const normalizeOverlayDurationSlider = (value: number | number[]): number => {
  const numeric = Number(Array.isArray(value) ? value[0] : value)
  return Number.isFinite(numeric)
    ? Math.min(16, Math.max(1, Math.round(numeric)))
    : overlayDurationSlider.value
}
const setOverlayDurationDraft = (value: number | number[]): void => { overlayDurationSlider.value = normalizeOverlayDurationSlider(value) }
const commitOverlayDuration = async (value: number | number[]): Promise<void> => {
  const sliderValue = normalizeOverlayDurationSlider(value)
  overlayDurationSlider.value = sliderValue
  await setActivity('overlayDuration', sliderValue >= 16 ? 0 : sliderValue)
}
const chooseLogDirectory = async (): Promise<void> => { const result = await window.aiServiceApi.chooseLogDirectory(); if (result.config) config.value = result.config }
const copyConfig = async (): Promise<void> => {
  const serviceName = `superconnectx_${status.value!.instanceIndex + 1}`
  const guide = t('aiService.copyGuide', { serviceName })
  const configText = await window.aiServiceApi.getCodexConfig()
  await navigator.clipboard.writeText(`${guide}\n\n${configText}`)
  message.value = t('aiService.copied')
}
const runTest = async (): Promise<void> => {
  const result = await selfTest()
  message.value = result.success
    ? t('aiService.selfTestPassed', { count: result.toolCount || 0, duration: result.durationMs })
    : t('aiService.selfTestFailed', { message: result.message })
}
const rotateToken = async (): Promise<void> => { const result = await window.aiServiceApi.rotateToken(); config.value = result.config; message.value = t('aiService.tokenRotated') }
</script>

<style scoped>
.ai-service-page{height:100%;overflow:auto;padding:18px 24px 28px 18px;box-sizing:border-box;color:var(--text-primary);background:var(--bg-primary)}
.ai-service-content{width:100%;max-width:880px;min-width:0;box-sizing:border-box}.page-header{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:0 8px 4px}.page-header h2{margin:0;font-size:22px}.page-header p,.section-desc,.help-section p,.help-section li{color:var(--text-secondary);font-size:12px;line-height:1.6}.page-header p{margin:7px 0 0}.header-action{width:auto!important;min-width:0;padding:4px 12px!important}
.group-section{margin-top:14px;padding:13px;border-radius:6px;background:var(--settings-group-bg,var(--bg-secondary));box-sizing:border-box;min-width:0}.group-title{margin-bottom:9px;padding-bottom:7px;border-bottom:2px solid var(--el-color-primary);color:var(--settings-label-text,var(--text-primary));font-size:15px;font-weight:700}.help-section ol{margin:6px 0 0;padding-left:22px}.security-note{margin:10px 0 0;padding:8px 10px;border-left:3px solid var(--el-color-primary);color:var(--text-secondary);background:color-mix(in srgb,var(--el-color-primary) 8%,transparent);font-size:11px;line-height:1.5}
.bridge-status-badge{display:flex;align-items:center;gap:8px;min-width:0;margin-bottom:8px;padding:9px 12px;border-radius:4px;font-size:13px}.bridge-status-badge.read-only{color:#72b486;background:rgba(119,185,139,.18)}.bridge-status-badge.full-control{color:#e58a5b;background:rgba(227,129,83,.2)}.bridge-status-badge.disabled{color:var(--text-secondary);background:rgba(128,128,128,.16)}.status-dot{width:8px;height:8px;flex:0 0 8px;border-radius:50%;background:currentColor;box-shadow:0 0 0 3px color-mix(in srgb,currentColor 18%,transparent)}.service-state{margin-left:auto;font-size:11px;opacity:.85}
.setting-item{display:flex;align-items:center;justify-content:space-between;gap:18px;min-width:0;padding:9px 0;border-bottom:1px solid var(--settings-item-border,var(--border-primary))}.setting-item:last-child{border-bottom:none}.setting-label{display:flex;flex:1 1 auto;min-width:0;flex-direction:column;gap:3px}.label-text{color:var(--settings-label-text,var(--text-primary));font-size:13px;font-weight:500}.label-desc{color:var(--settings-label-desc,var(--text-secondary));font-size:11px;line-height:1.45}.compact-control{width:210px;max-width:42%;min-width:150px;box-sizing:border-box;padding:7px 9px;border:1px solid var(--border-input);border-radius:5px;color:var(--text-primary);background:var(--bg-input)}
.client-indicator{display:inline-flex;align-items:center;gap:8px;flex:0 0 auto;padding:7px 11px;border:1px solid var(--settings-item-border,var(--border-primary));border-radius:16px;color:var(--text-secondary);background:color-mix(in srgb,var(--bg-primary) 80%,transparent);font-size:12px;line-height:1}.client-indicator .status-dot{align-self:center;margin:0}.client-indicator>span:last-child{display:block;line-height:16px}.client-indicator.connected{color:#72b486;border-color:rgba(119,185,139,.3);background:rgba(119,185,139,.12)}
.service-facts{display:grid;grid-template-columns:minmax(0,2fr) minmax(100px,1fr) minmax(90px,.7fr) minmax(110px,1fr);gap:10px;margin-top:10px;padding:10px;border:1px solid var(--settings-item-border,var(--border-primary));border-radius:5px}.service-facts div{display:grid;min-width:0;gap:4px}.service-facts .service-facts-title{display:block;grid-column:1/-1;padding-bottom:7px;border-bottom:1px solid var(--settings-item-border,var(--border-primary));color:var(--settings-label-text,var(--text-primary));font-size:12px;font-weight:700}.service-facts span{color:var(--text-secondary);font-size:10px}.service-facts code,.service-facts strong{overflow:hidden;color:var(--text-primary);font-size:11px;text-overflow:ellipsis;white-space:nowrap}
.ai-service-page .btn-primary{box-sizing:border-box;height:26px;padding:4px 10px!important;border-radius:4px;font-family:inherit;font-size:12px;line-height:18px;cursor:pointer}.action-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.action-grid .btn-primary{min-width:0;padding:4px 6px!important}.success-message,.error-message{margin:9px 2px 0;font-size:12px}.success-message{color:var(--color-success)}.error-message{color:var(--color-danger)}.section-desc{margin:-1px 0 10px}
.capability-list{display:flex;flex-direction:column;gap:8px}.capability-item{min-width:0;padding:9px 10px;border:1px solid var(--settings-item-border,var(--border-primary));border-radius:4px}.capability-header,.capability-actions{display:flex;align-items:center}.capability-header{justify-content:space-between;gap:10px}.capability-actions{flex:0 0 auto;gap:8px}.capability-header strong{color:var(--settings-label-text,var(--text-primary));font-size:13px}.capability-item p,.capability-item code,.operation-interfaces span{color:var(--settings-label-desc,var(--text-secondary));font-size:11px;line-height:1.5}.capability-item p{margin:4px 0 0}.operation-interfaces{display:flex;align-items:flex-start;gap:5px;margin-top:3px}.operation-interfaces span{flex:0 0 auto}.capability-item code{display:block;overflow-wrap:anywhere}.capability-status{flex:0 0 auto;padding:3px 8px;border:1px solid transparent;border-radius:4px;font-size:11px}.capability-status.available{color:#72b486;border-color:rgba(119,185,139,.22);background:rgba(119,185,139,.14)}.capability-status.readable{color:#88a890;border-color:rgba(119,185,139,.13);background:rgba(119,185,139,.08)}.capability-status.unavailable{color:var(--text-secondary);border-color:rgba(128,128,128,.12);background:rgba(128,128,128,.08)}
.range-control{display:grid;grid-template-columns:minmax(120px,180px) 64px;align-items:center;gap:10px;flex:0 0 auto}.range-control input{width:100%;accent-color:var(--el-color-primary)}.range-control>span{color:var(--text-primary);font-size:11px;text-align:right}.path-control{display:grid;grid-template-columns:minmax(160px,1fr) 92px;align-items:center;gap:8px;width:min(430px,58%);min-width:0}.path-control code{overflow:hidden;padding:7px 9px;border:1px solid var(--border-input);border-radius:4px;color:var(--text-secondary);background:var(--bg-input);font-size:10px;text-overflow:ellipsis;white-space:nowrap}.path-button{padding:4px 10px!important}.loading{margin:20px 8px;color:var(--text-secondary)}
.duration-slider{width:100%}.duration-control :deep(.el-slider__marks-text){display:none}.duration-control.permanent :deep(.el-slider__runway){background:linear-gradient(90deg,rgba(227,160,79,.2),rgba(227,160,79,.48))}.duration-control.permanent :deep(.el-slider__bar){background:linear-gradient(90deg,#c98232,#e3a04f)}.duration-control.permanent :deep(.el-slider__button){border-color:#e3a04f;background:#fff4df}.duration-control.permanent .duration-value{color:#e39a32;font-weight:700}
@media(max-width:760px){.ai-service-page{padding-right:18px}.service-facts{grid-template-columns:repeat(2,minmax(0,1fr))}.setting-item{align-items:flex-start;flex-direction:column;gap:8px}.compact-control,.path-control{width:100%;max-width:none}.range-control{width:100%;grid-template-columns:minmax(0,1fr) 64px}}
</style>
