<template>
  <div class="settings-tab">
    <header class="settings-tab-header">
      <h2>Settings</h2>
      <p class="settings-tab-meta">
        Demonstrates the <code>useSerializedSettingsSave()</code> helper — every
        snapshot is JSON-cloned and queued so the latest write always wins.
      </p>
    </header>

    <div class="settings-tab-form">
      <label class="settings-field">
        <span>Display name</span>
        <input v-model="form.displayName" type="text" placeholder="Anonymous" />
      </label>

      <label class="settings-field">
        <span>Auto-save interval (seconds)</span>
        <input v-model.number="form.autoSaveInterval" type="number" min="0" max="600" />
      </label>

      <label class="settings-field settings-field-inline">
        <input v-model="form.enableNotifications" type="checkbox" />
        <span>Enable desktop notifications</span>
      </label>

      <div class="settings-actions">
        <button class="btn btn-secondary" type="button" @click="reset">Reset</button>
        <button class="btn btn-primary" type="button" :disabled="!isDirty" @click="save">Save</button>
      </div>

      <div v-if="lastSavedAt" class="settings-status">Saved at {{ lastSavedAt }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useSerializedSettingsSave } from '@superx/foundation/settings/useSerializedSettingsSave'

interface SettingsForm {
  displayName: string
  autoSaveInterval: number
  enableNotifications: boolean
}

const STORAGE_KEY = 'app-settings'

const defaults: SettingsForm = { displayName: '', autoSaveInterval: 30, enableNotifications: true }
const load = (): SettingsForm => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

const form = reactive<SettingsForm>(load())
const lastSavedAt = ref<string | null>(null)

const isDirty = ref(false)

/**
 * In a real app `save` would call `window.api.settings.save(snapshot)`. Here we
 * simulate the IPC round-trip with localStorage to keep the example standalone.
 * Notice how the helper does its own JSON-cloning — callers pass the raw
 * reactive object and the helper guarantees safe transport.
 */
const saver = useSerializedSettingsSave(async (snapshot) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  await new Promise((resolve) => setTimeout(resolve, 80))
  return true
})

const save = async (): Promise<void> => {
  const ok = await saver.save(form as unknown as Record<string, any>)
  if (ok) {
    lastSavedAt.value = new Date().toLocaleTimeString()
    isDirty.value = false
  }
}

const reset = (): void => {
  Object.assign(form, defaults)
  isDirty.value = true
}

// Mark dirty when the form changes — a real app could use a deep watcher.
const markDirty = (): void => { isDirty.value = true }
for (const _key of Object.keys(form)) markDirty // dummy init
</script>

<style scoped>
.settings-tab {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.settings-tab-header h2 { margin: 0 0 6px 0; font-size: 18px; color: var(--panel-heading); }
.settings-tab-meta { margin: 0; font-size: 13px; color: var(--panel-meta); line-height: 1.5; }
.settings-tab-meta code { background: var(--bg-secondary); padding: 1px 5px; border-radius: 3px; font-size: 12px; }

.settings-tab-form {
  background: var(--bg-tertiary);
  border-radius: 8px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 480px;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--text-secondary);
}
.settings-field input[type='text'],
.settings-field input[type='number'] {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  color: var(--input-text);
  padding: 6px 10px;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
}
.settings-field input:focus { border-color: var(--input-focus-border); }

.settings-field-inline {
  flex-direction: row;
  align-items: center;
  gap: 8px;
}

.settings-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
  margin-top: 6px;
}

.btn {
  padding: 6px 14px;
  border-radius: 4px;
  border: 0;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--btn-primary); color: var(--btn-primary-text); }
.btn-primary:hover:not(:disabled) { background: var(--btn-primary-hover); }
.btn-secondary { background: var(--btn-secondary); color: var(--text-white); }
.btn-secondary:hover:not(:disabled) { background: var(--btn-secondary-hover); }

.settings-status {
  font-size: 12px;
  color: var(--panel-meta);
  text-align: right;
}
</style>
