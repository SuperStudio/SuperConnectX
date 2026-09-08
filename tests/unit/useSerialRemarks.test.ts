import { beforeEach, describe, expect, it, vi } from 'vitest'

const { errorMessage, storageApi } = vi.hoisted(() => ({
  errorMessage: vi.fn(),
  storageApi: {
    getComSettings: vi.fn(),
    saveComSettings: vi.fn()
  }
}))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('element-plus', () => ({ ElMessage: { error: errorMessage } }))
vi.stubGlobal('window', { storageApi })

import { useSerialRemarks } from '../../src/renderer/src/features/connections/useSerialRemarks'

describe('useSerialRemarks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storageApi.getComSettings.mockResolvedValue({})
    storageApi.saveComSettings.mockResolvedValue(true)
  })

  it('caches a successfully loaded empty remark', async () => {
    const remarks = useSerialRemarks({})

    await expect(remarks.loadSerialRemark('COM1')).resolves.toBe('')
    await expect(remarks.loadSerialRemark('COM1')).resolves.toBe('')

    expect(storageApi.getComSettings).toHaveBeenCalledTimes(1)
    expect(Object.hasOwn(remarks.serialRemarks, 'COM1')).toBe(true)
  })

  it('opens a remark dialog from the terminal remark without reloading storage', async () => {
    const remarks = useSerialRemarks({ terminal: { getRemark: () => 'from terminal' } })

    await remarks.openRemarkDialog({ id: 'terminal', comName: 'COM1' })

    expect(remarks.editingRemarkComName.value).toBe('COM1')
    expect(remarks.editingRemark.value).toBe('from terminal')
    expect(remarks.showRemarkDialog.value).toBe(true)
    expect(storageApi.getComSettings).not.toHaveBeenCalled()
  })

  it('loads all remarks and ignores an individual storage failure', async () => {
    storageApi.getComSettings
      .mockResolvedValueOnce({ remark: 'one' })
      .mockRejectedValueOnce(new Error('unavailable'))

    const remarks = useSerialRemarks({})
    await remarks.loadAllSerialRemarks([{ path: 'COM1' }, { path: 'COM2' }])

    expect(remarks.serialRemarks).toMatchObject({ COM1: 'one' })
    expect(Object.hasOwn(remarks.serialRemarks, 'COM2')).toBe(false)
  })

  it('does not let a slow first port overwrite a quickly opened second port', async () => {
    let resolveFirst: (value: unknown) => void = () => {}
    storageApi.getComSettings
      .mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve }))
      .mockResolvedValueOnce({ remark: 'second' })
    const remarks = useSerialRemarks({})

    const first = remarks.openSerialPortRemark('COM1')
    const second = remarks.openSerialPortRemark('COM2')
    await second
    resolveFirst({ remark: 'first' })
    await first

    expect(remarks.editingRemarkComName.value).toBe('COM2')
    expect(remarks.editingRemark.value).toBe('second')
  })

  it('saves by comName and updates every open terminal for that port', async () => {
    storageApi.getComSettings.mockResolvedValue({ baudRate: 115200, remark: 'old' })
    const com1First = { getComName: () => 'COM1', setRemark: vi.fn() }
    const com1Second = { getComName: () => 'COM1', setRemark: vi.fn() }
    const com2 = { getComName: () => 'COM2', setRemark: vi.fn() }
    const remarks = useSerialRemarks({ staleTab: com2, first: com1First, second: com1Second })
    remarks.editingRemarkComName.value = 'COM1'
    remarks.editingRemark.value = 'device'
    remarks.showRemarkDialog.value = true

    await remarks.saveSerialRemark({ id: 'staleTab', comName: 'COM2' })

    expect(storageApi.saveComSettings).toHaveBeenCalledWith('COM1', { baudRate: 115200, remark: 'device' })
    expect(com1First.setRemark).toHaveBeenCalledWith('device')
    expect(com1Second.setRemark).toHaveBeenCalledWith('device')
    expect(com2.setRemark).not.toHaveBeenCalled()
    expect(remarks.serialRemarks.COM1).toBe('device')
    expect(remarks.showRemarkDialog.value).toBe(false)
  })

  it.each([
    ['a rejected save', () => storageApi.saveComSettings.mockRejectedValue(new Error('failed'))],
    ['a false save result', () => storageApi.saveComSettings.mockResolvedValue(false)]
  ])('keeps cache and terminals unchanged after %s', async (_description, failSave) => {
    failSave()
    const terminal = { getComName: () => 'COM1', setRemark: vi.fn() }
    const remarks = useSerialRemarks({ terminal })
    remarks.serialRemarks.COM1 = 'old'
    remarks.editingRemarkComName.value = 'COM1'
    remarks.editingRemark.value = 'new'
    remarks.showRemarkDialog.value = true

    await remarks.saveSerialRemark()

    expect(remarks.serialRemarks.COM1).toBe('old')
    expect(terminal.setRemark).not.toHaveBeenCalled()
    expect(remarks.showRemarkDialog.value).toBe(true)
    expect(errorMessage).toHaveBeenCalledWith('dialog.remarkSaveFailed')
  })
})
