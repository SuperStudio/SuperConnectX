import StoreRepository, { type StoreRepositoryOptions } from './StoreRepository'

/**
 * Typed object preferences with non-destructive partial updates.
 * It intentionally does not prescribe a schema, storage directory, or defaults.
 */
export default class PreferenceStore<TPreferences extends Record<string, any>> extends StoreRepository<TPreferences> {
  constructor(options: StoreRepositoryOptions<TPreferences>) {
    super(options)
  }

  getPreferences(): TPreferences {
    return this.getStore() as TPreferences
  }

  savePreferences(preferences: Partial<TPreferences>): void {
    for (const [key, value] of Object.entries(preferences)) {
      // conf 不允许 set(key, undefined)，值为 undefined 表示清除该键
      if (value === undefined) {
        this.deleteValue(key)
      } else {
        this.setValue(key, value)
      }
    }
  }
}
