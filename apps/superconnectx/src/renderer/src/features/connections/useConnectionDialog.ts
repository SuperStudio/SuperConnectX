/**
 * Connection CRUD feature orchestration.
 * Storage and confirmation services are injected through the renderer bridge.
 */
import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'

export interface ConnectionDialogController {
  open: (connectionType: string) => void
  openEdit: (connection: unknown) => void
  closeOnSuccess: () => void
  onSaveError: (message: string) => void
}

export function useConnectionDialog(
  onConnectionsChanged: () => Promise<void>,
  connectionDialogRef: Ref<ConnectionDialogController | null>
) {
  const { t } = useI18n()

  const openCreateDialog = () => {
    connectionDialogRef.value?.open('ftp')
  }

  const editCreateDialog = (connection: any) => {
    connectionDialogRef.value?.openEdit(connection)
  }

  const handleConnectionSubmit = async (data: any) => {
    try {
      if (data.id) {
        await window.storageApi.updateConnection(data)
      } else {
        await window.storageApi.addConnection(data)
      }
      await onConnectionsChanged()
      connectionDialogRef.value?.closeOnSuccess()
    } catch (error: any) {
      connectionDialogRef.value?.onSaveError(
        error?.message?.includes('已存在相同的连接')
          ? t('dialog.connectionExists')
          : t('dialog.completeForm')
      )
    }
  }

  const deleteConnection = async (connection: any) => {
    try {
      await ElMessageBox.confirm(
        t('dialog.deleteConfirm', { name: connection.name }),
        t('dialog.deleteConnection'),
        {
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
          type: 'warning',
          center: true,
          cancelButtonClass: 'el-button--danger'
        }
      )
      await window.storageApi.deleteConnection(connection.id)
      await onConnectionsChanged()
    } catch (error) {
      if (error !== 'cancel') {
        console.error(t('common.operationFailed'), error)
        ElMessage.error(t('common.operationFailed'))
      }
    }
  }

  return { openCreateDialog, editCreateDialog, handleConnectionSubmit, deleteConnection }
}
