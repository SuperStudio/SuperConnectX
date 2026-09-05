import { ref, reactive, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'

/** Minimal COM terminal contract needed to keep serial remarks synchronized. */
export interface ComTerminalRemarkRef {
  getRemark?: () => string
  updateRemark?: (remark: string) => Promise<void>
}

/** Maintains persisted COM-port remarks for the SuperConnectX connection feature. */
export function useSerialRemarks(comTerminalRefs: Record<string, ComTerminalRemarkRef>) {
  const { t } = useI18n()
  const showRemarkDialog = ref(false)
  const editingRemark = ref('')
  const editingRemarkComName = ref('')
  const serialRemarks = reactive<Record<string, string>>({})
  const remarkInputRef = ref<any>(null)

  const loadSerialRemark = async (comName: string): Promise<string> => {
    if (serialRemarks[comName]) return serialRemarks[comName]
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
    editingRemarkComName.value = tab.comName
    const terminal = comTerminalRefs[tab.id.toString()]

    if (serialRemarks[tab.comName]) {
      editingRemark.value = serialRemarks[tab.comName]
    } else if (terminal?.getRemark) {
      editingRemark.value = terminal.getRemark() || ''
    } else {
      try {
        const settings = await window.storageApi.getComSettings(tab.comName)
        editingRemark.value = settings?.remark || ''
      } catch {
        editingRemark.value = ''
      }
    }
    showRemarkDialog.value = true
  }

  const onRemarkDialogOpened = () => {
    nextTick(() => {
      const input = remarkInputRef.value?.$el?.querySelector('input')
      if (input) { input.focus(); input.select() }
    })
  }

  const saveSerialRemark = async (rightClickedTab?: { id: string | number; comName?: string } | null) => {
    const comName = editingRemarkComName.value
    if (!comName) return
    serialRemarks[comName] = editingRemark.value

    const terminal = rightClickedTab ? comTerminalRefs[rightClickedTab.id.toString()] : undefined
    if (terminal?.updateRemark) {
      await terminal.updateRemark(editingRemark.value)
      showRemarkDialog.value = false
      return
    }

    try {
      const currentSettings = await window.storageApi.getComSettings(comName)
      await window.storageApi.saveComSettings(comName, { ...currentSettings, remark: editingRemark.value })
    } catch (error) {
      console.error(t('dialog.remarkSaveFailed'), error)
      ElMessage.error(t('dialog.remarkSaveFailed'))
    }
    showRemarkDialog.value = false
  }

  return { showRemarkDialog, editingRemark, editingRemarkComName, serialRemarks, remarkInputRef, loadSerialRemark, loadAllSerialRemarks, openRemarkDialog, onRemarkDialogOpened, saveSerialRemark }
}
