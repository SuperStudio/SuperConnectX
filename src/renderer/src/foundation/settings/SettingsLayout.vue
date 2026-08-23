<template>
  <div class="settings-layout">
    <nav class="settings-nav" :aria-label="navigationLabel">
      <button
        v-for="category in categories"
        :key="category.key"
        type="button"
        class="nav-item"
        :class="{ active: modelValue === category.key }"
        @click="$emit('update:modelValue', category.key)"
      >
        <slot name="category" :category="category">{{ category.label }}</slot>
      </button>
      <div v-if="$slots.footer" class="nav-footer"><slot name="footer" /></div>
    </nav>
    <section class="settings-panel" :class="{ 'fill-panel': fillPanel }">
      <slot />
    </section>
  </div>
</template>

<script setup lang="ts">
export interface SettingsCategory {
  key: string
  label: string
}

withDefaults(defineProps<{
  modelValue: string
  categories: SettingsCategory[]
  navigationLabel?: string
  fillPanel?: boolean
}>(), {
  navigationLabel: 'Settings categories',
  fillPanel: false
})

defineEmits<{ 'update:modelValue': [key: string] }>()
</script>

<style scoped>
.settings-layout { display: flex; flex: 1; min-height: 0; overflow: hidden; }
.settings-nav { width: 140px; background: var(--settings-nav-bg); border-right: 1px solid var(--settings-nav-border); padding: 8px 0; flex-shrink: 0; display: flex; flex-direction: column; }
.nav-item { padding: 8px 16px; border: 0; background: transparent; color: var(--settings-nav-item-color); font-size: 13px; text-align: left; cursor: pointer; transition: background 0.2s; }
.nav-item:hover { background: var(--settings-nav-item-hover); }
.nav-item.active { background: var(--settings-nav-item-active-bg); color: var(--settings-nav-item-active-color); }
.nav-footer { margin-top: auto; padding: 16px 8px; border-top: 1px solid var(--settings-nav-footer-border); }
.settings-panel { flex: 1; min-width: 0; overflow-y: auto; padding: 16px; }
.settings-panel.fill-panel { padding: 0; overflow: hidden; display: flex; flex-direction: column; }
.settings-panel.fill-panel > :deep(*) { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.settings-panel::-webkit-scrollbar { width: 8px; }
.settings-panel::-webkit-scrollbar-track { background: transparent; }
.settings-panel::-webkit-scrollbar-thumb { background: var(--scrollbar-thumb-dark); border-radius: 4px; }
.settings-panel::-webkit-scrollbar-thumb:hover { background: var(--scrollbar-thumb-dark-hover); }
</style>
