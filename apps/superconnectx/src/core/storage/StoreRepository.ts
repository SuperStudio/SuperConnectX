import Store from 'electron-store'

export interface StoreRepositoryOptions<TDefaults extends Record<string, any>> {
  name: string
  cwd: string
  defaults: TDefaults
}

/**
 * Minimal typed wrapper around electron-store.
 * The application owns its storage path and schema; this core class only
 * creates the store and exposes typed value access.
 */
export default class StoreRepository<TDefaults extends Record<string, any> = Record<string, unknown>> {
  readonly storageData: Store<any>
  readonly storageName: string

  constructor(options: StoreRepositoryOptions<TDefaults>) {
    this.storageName = options.name
    this.storageData = new Store<any>({
      name: options.name,
      cwd: options.cwd,
      defaults: options.defaults
    })
  }

  getValue<TValue>(key: string): TValue | undefined {
    return this.storageData.get(key) as TValue | undefined
  }

  setValue<TValue>(key: string, value: TValue): void {
    this.storageData.set(key, value)
  }

  getStore(): Record<string, unknown> {
    return this.storageData.store as Record<string, unknown>
  }
}
