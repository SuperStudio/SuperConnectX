import { readonly, ref, type Ref } from 'vue'

export type AppTheme = 'dark' | 'light'

export interface ThemeController {
  theme: Readonly<Ref<AppTheme>>
  applyTheme(theme: AppTheme): void
  toggleTheme(): void
}

export interface ThemeOptions {
  storageKey?: string
  defaultTheme?: AppTheme
}

/**
 * Applies a CSS-token theme to the document and persists the user preference.
 * Components can use this shared controller without knowing about app menus.
 */
export function useTheme(options: ThemeOptions = {}): ThemeController {
  const storageKey = options.storageKey ?? 'app-theme'
  const defaultTheme = options.defaultTheme ?? 'dark'
  const savedTheme = localStorage.getItem(storageKey)
  const theme = ref<AppTheme>(savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : defaultTheme)

  const applyTheme = (nextTheme: AppTheme): void => {
    theme.value = nextTheme
    localStorage.setItem(storageKey, nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
  }

  const toggleTheme = (): void => {
    applyTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  applyTheme(theme.value)

  return { theme: readonly(theme), applyTheme, toggleTheme }
}
