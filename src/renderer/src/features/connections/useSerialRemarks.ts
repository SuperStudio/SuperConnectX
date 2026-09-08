import { ref, reactive, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

/** Minimal COM terminal contract needed to keep serial remarks synchronized. */
export interface ComTerminalRemarkRef {
  getComName?: () => string
  getRemark?: () => string
  setRemark?: (remark: string) => void
}

/** Maintains persisted COM-port remarks for the SuperConnectX connection feature. */
export function useSerialRemarks(comTerminalRefs: Record<string, ComTerminalRemarkRef>) {
  const { t } = useI18n()
  const showRemarkDialog = ref(false)
  const editingRemark = ref('')
  const editingRemarkComName = ref('')
  const serialRemarks = reactive<Record<string, string>>({})
  const remarkInputRef = ref<any>(null)
  let openRequestId = 0

  const loadSerialRemark = async (comName: string): Promise<string> => {
    if (Object.hasOwn(serialRemarks, comName)) return serialRemarks[comName]
    try {
      const settings = await window.storageApi.getComSettings(comName)
      const remark = settings?.remark || ''
      serialRemarks[comName] = remark
      return remark
    } catch {
      return ''
    }
  }

  const loadAllSerialRemarks = async (serialPorts: SerialPortInfo[]) => {
    for (const port of serialPorts) await loadSerialRemark(port.path)
  }

  const openRemarkDialog = async (tab: { comName?: string; id: string | number }) => {
    if (!tab.comName) return
    const comName = tab.comName
    const requestId = ++openRequestId
    editingRemarkComName.value = comName
    const terminal = comTerminalRefs[tab.id.toString()]

    let remark: string
    if (Object.hasOwn(serialRemarks, comName)) {
      remark = serialRemarks[comName]
    } else if (terminal?.getRemark) {
      remark = terminal.getRemark() || ''
      serialRemarks[comName] = remark
    } else {
      try {
        const settings = await window.storageApi.getComSettings(comName)
        remark = settings?.remark || ''
        serialRemarks[comName] = remark
      } catch {
        remark = ''
      }
    }
    if (requestId !== openRequestId) return
    editingRemark.value = remark
    showRemarkDialog.value = true
  }

  const openSerialPortRemark = async (comName: string) => {
    const requestId = ++openRequestId
    editingRemarkComName.value = comName
    const remark = Object.hasOwn(serialRemarks, comName) ? serialRemarks[comName] : await loadSerialRemark(comName)
    if (requestId !== openRequestId) return
    editingRemark.value = remark
    showRemarkDialog.value = true
  }

  const onRemarkDialogOpened = () => {
    nextTick(() => {
      const input = remarkInputRef.value?.$el?.querySelector('input')
      if (input) { input.focus(); input.select() }
    })
  }

  const saveSerialRemark = async (_rightClickedTab?: { id: string | number; comName?: string } | null) => {
    const comName = editingRemarkComName.value
    if (!comName) return
    const remark = editingRemark.value

    try {
      const currentSettings = await window.storageApi.getComSettings(comName)
      const saved = await window.storageApi.saveComSettings(comName, { ...currentSettings, remark })
      if (saved === false) throw new Error('saveComSettings returned false')
      serialRemarks[comName] = remark
      for (const terminal of Object.values(comTerminalRefs)) {
        if (terminal.getComName?.() === comName) terminal.setRemark?.(remark)
      }
      if (editingRemarkComName.value === comName) showRemarkDialog.value = false
    } catch (error) {
      console.error(t('dialog.remarkSaveFailed'), error)
      ElMessage.error(t('dialog.remarkSaveFailed'))
    }
  }

  return { showRemarkDialog, editingRemark, editingRemarkComName, serialRemarks, remarkInputRef, loadSerialRemark, loadAllSerialRemarks, openRemarkDialog, openSerialPortRemark, onRemarkDialogOpened, saveSerialRemark }
}
