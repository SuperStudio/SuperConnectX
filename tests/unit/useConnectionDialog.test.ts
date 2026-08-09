/**
 * useConnectionDialog 测试
 * 测试连接对话框：创建/编辑/删除连接
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: any) => {
      const translations: Record<string, string> = {
        'dialog.connectionExists': 'Connection already exists',
        'dialog.completeForm': 'Please complete the form',
        'dialog.deleteConfirm': `Delete ${params?.name}?`,
        'dialog.deleteConnection': 'Delete Connection',
        'common.confirm': 'Confirm',
        'common.cancel': 'Cancel',
        'common.operationFailed': 'Operation failed'
      }
      return translations[key] || key
    }
  })
}))

vi.mock('element-plus', () => ({
  ElMessage: {
    error: vi.fn(),
    success: vi.fn()
  },
  ElMessageBox: {
    confirm: vi.fn().mockResolvedValue('confirm')
  }
}))

const mockStorageApi = {
  updateConnection: vi.fn().mockResolvedValue({}),
  addConnection: vi.fn().mockResolvedValue({}),
  deleteConnection: vi.fn().mockResolvedValue({})
}
;(globalThis as any).window = { storageApi: mockStorageApi }

import { useConnectionDialog } from '../../src/renderer/src/composables/app/useConnectionDialog'

describe('useConnectionDialog', () => {
  let onConnectionsChanged: ReturnType<typeof vi.fn>
  let dialogRef: any

  beforeEach(() => {
    vi.clearAllMocks()
    onConnectionsChanged = vi.fn().mockResolvedValue(undefined)
    dialogRef = ref({
      open: vi.fn(),
      openEdit: vi.fn(),
      closeOnSuccess: vi.fn(),
      onSaveError: vi.fn()
    })
  })

  describe('openCreateDialog', () => {
    it('should call dialog open with ftp type', () => {
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)
      dialog.openCreateDialog()

      expect(dialogRef.value.open).toHaveBeenCalledWith('ftp')
    })
  })

  describe('editCreateDialog', () => {
    it('should call dialog openEdit with connection data', () => {
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)
      const conn = { id: 1, name: 'Test', host: '127.0.0.1', port: 22 }

      dialog.editCreateDialog(conn)
      expect(dialogRef.value.openEdit).toHaveBeenCalledWith(conn)
    })
  })

  describe('handleConnectionSubmit', () => {
    it('should add new connection when no id', async () => {
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)
      const data = { name: 'New', host: '10.0.0.1', port: 23 }

      await dialog.handleConnectionSubmit(data)
      expect(mockStorageApi.addConnection).toHaveBeenCalledWith(data)
      expect(onConnectionsChanged).toHaveBeenCalled()
      expect(dialogRef.value.closeOnSuccess).toHaveBeenCalled()
    })

    it('should update connection when id exists', async () => {
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)
      const data = { id: 5, name: 'Updated', host: '10.0.0.1', port: 23 }

      await dialog.handleConnectionSubmit(data)
      expect(mockStorageApi.updateConnection).toHaveBeenCalledWith(data)
    })

    it('should handle duplicate connection error', async () => {
      mockStorageApi.addConnection.mockRejectedValueOnce(
        new Error('已存在相同的连接')
      )
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)

      await dialog.handleConnectionSubmit({ name: 'Dup' })
      expect(dialogRef.value.onSaveError).toHaveBeenCalledWith('Connection already exists')
    })

    it('should handle generic save error', async () => {
      mockStorageApi.addConnection.mockRejectedValueOnce(new Error('Some error'))
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)

      await dialog.handleConnectionSubmit({ name: 'Bad' })
      expect(dialogRef.value.onSaveError).toHaveBeenCalledWith('Please complete the form')
    })
  })

  describe('deleteConnection', () => {
    it('should delete connection after confirmation', async () => {
      const { ElMessageBox } = await import('element-plus')
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)
      const conn = { id: 10, name: 'ToDelete' }

      await dialog.deleteConnection(conn)
      expect(ElMessageBox.confirm).toHaveBeenCalled()
      expect(mockStorageApi.deleteConnection).toHaveBeenCalledWith(10)
      expect(onConnectionsChanged).toHaveBeenCalled()
    })

    it('should not delete if user cancels', async () => {
      const { ElMessageBox } = await import('element-plus')
      ;(ElMessageBox.confirm as any).mockRejectedValueOnce('cancel')
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)

      await dialog.deleteConnection({ id: 10, name: 'Test' })
      expect(mockStorageApi.deleteConnection).not.toHaveBeenCalled()
    })

    it('should handle deletion error', async () => {
      const { ElMessageBox, ElMessage } = await import('element-plus')
      mockStorageApi.deleteConnection.mockRejectedValueOnce(new Error('DB error'))
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)

      await dialog.deleteConnection({ id: 10, name: 'Test' })
      expect(ElMessage.error).toHaveBeenCalledWith('Operation failed')
    })
  })

  describe('returned API', () => {
    it('should return all expected methods', () => {
      const dialog = useConnectionDialog(onConnectionsChanged, dialogRef)
      expect(typeof dialog.openCreateDialog).toBe('function')
      expect(typeof dialog.editCreateDialog).toBe('function')
      expect(typeof dialog.handleConnectionSubmit).toBe('function')
      expect(typeof dialog.deleteConnection).toBe('function')
    })
  })
})
