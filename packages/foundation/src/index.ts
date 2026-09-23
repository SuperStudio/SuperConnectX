/**
 * @superx/foundation — top-level barrel.
 *
 * Sub-path imports are preferred (`@superx/foundation/shell/AppShell.vue`)
 * so apps only bundle what they use. This barrel exists for convenience
 * and discovery.
 */
export * from './theme/useTheme'
export * from './settings/SettingsRegistry'
export * from './settings/useSerializedSettingsSave'
export * from './shell/useNotificationCenter'
export * from './shell/useSidebarResize'
export * from './workbench/useSplitWorkspace'
export * from './workbench/useWorkbenchTabDrag'
export * from './workbench/useWorkbenchTabs'
