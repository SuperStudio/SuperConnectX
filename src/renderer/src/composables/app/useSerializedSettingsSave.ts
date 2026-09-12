export type SettingsSaveApi = (settings: Record<string, any>) => Promise<boolean>

/** Serialize writes so a later settings snapshot cannot be overwritten by an older request. */
export const useSerializedSettingsSave = (saveApi: SettingsSaveApi) => {
  let saveQueue: Promise<void> = Promise.resolve()
  let latestSave: Promise<boolean> = Promise.resolve(true)

  const save = (settings: Record<string, any>): Promise<boolean> => {
    const snapshot = JSON.parse(JSON.stringify(settings)) as Record<string, any>
    const operation = saveQueue.then(() => saveApi(snapshot))
    latestSave = operation
    saveQueue = operation.then(
      () => undefined,
      () => undefined
    )
    return operation
  }

  const waitForLatest = async (): Promise<boolean> => {
    try {
      return await latestSave
    } catch {
      return false
    }
  }

  return { save, waitForLatest }
}
