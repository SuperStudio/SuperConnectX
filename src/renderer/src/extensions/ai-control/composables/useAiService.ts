import { onMounted, onUnmounted, ref, type Ref } from 'vue'
import type {
  AiConfigDocument,
  AiConfigPatch
} from '../../../../../shared/extensions/ai-control/AiConfigTypes'
import type {
  AiSelfTestResult,
  AiServiceStatus
} from '../../../../../shared/extensions/ai-control/AiServiceTypes'

interface UseAiServiceResult {
  status: Ref<AiServiceStatus | null>
  config: Ref<AiConfigDocument | null>
  loading: Ref<boolean>
  error: Ref<string>
  load(): Promise<void>
  save(patch: Omit<AiConfigPatch, 'expectedRevision'>): Promise<void>
  selfTest(): Promise<AiSelfTestResult>
}

export function useAiService(): UseAiServiceResult {
  const status = ref<AiServiceStatus | null>(null)
  const config = ref<AiConfigDocument | null>(null)
  const loading = ref(false)
  const error = ref('')
  let offState: (() => void) | undefined
  let offConfig: (() => void) | undefined

  const load = async (): Promise<void> => {
    loading.value = true
    error.value = ''
    try {
      ;[status.value, config.value] = await Promise.all([
        window.aiServiceApi.getState(),
        window.aiServiceApi.getConfig()
      ])
    } catch (value) {
      error.value = value instanceof Error ? value.message : String(value)
    } finally {
      loading.value = false
    }
  }

  const save = async (patch: Omit<AiConfigPatch, 'expectedRevision'>): Promise<void> => {
    if (!config.value) return
    config.value = await window.aiServiceApi.saveConfig({
      ...patch,
      expectedRevision: config.value.revision
    })
    status.value = await window.aiServiceApi.getState()
  }

  const selfTest = (): Promise<AiSelfTestResult> => window.aiServiceApi.runSelfTest()

  onMounted(() => {
    void load()
    offState = window.aiServiceApi.onStateChanged((value) => {
      status.value = value
    })
    offConfig = window.aiServiceApi.onConfigChanged((value) => {
      config.value = value
    })
  })
  onUnmounted(() => {
    offState?.()
    offConfig?.()
  })

  return { status, config, loading, error, load, save, selfTest }
}
