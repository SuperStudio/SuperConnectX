import type { SettingsCategory } from './types'

export interface SettingsCategoryRegistration {
  /** Unique, application-owned identifier for the category. */
  key: string
  /** Resolves presentation text so locale changes are reflected by the host. */
  getLabel: () => string
  /** Lower values appear first. Categories with the same order preserve registration order. */
  order?: number
}

/**
 * Registers settings categories without coupling the shell to forms, persistence,
 * i18n libraries, or application features.
 */
export class SettingsRegistry {
  private readonly registrations = new Map<string, SettingsCategoryRegistration>()

  register(category: SettingsCategoryRegistration): void {
    if (this.registrations.has(category.key)) {
      throw new Error(`A settings category is already registered for key "${category.key}".`)
    }
    this.registrations.set(category.key, category)
  }

  getCategories(): SettingsCategory[] {
    return [...this.registrations.values()]
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
      .map(category => ({ key: category.key, label: category.getLabel() }))
  }
}
