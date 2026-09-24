<template>
  <div class="about-panel">
    <header class="about-panel-header">
      <h2>About</h2>
      <p class="about-panel-meta">A minimal Vue 3 desktop shell template.</p>
    </header>

    <section class="about-card">
      <div class="about-row"><span class="about-key">App name</span><span>{{ appName }}</span></div>
      <div class="about-row"><span class="about-key">Electron</span><span>{{ versions.electron || 'n/a' }}</span></div>
      <div class="about-row"><span class="about-key">Chromium</span><span>{{ versions.chrome || 'n/a' }}</span></div>
      <div class="about-row"><span class="about-key">Node</span><span>{{ versions.node || 'n/a' }}</span></div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ appName: string }>()

const versions = ref({
  electron: (window as any).versions?.electron ?? '',
  chrome: (window as any).versions?.chrome ?? '',
  node: (window as any).versions?.node ?? ''
})
</script>

<style scoped>
.about-panel { flex: 1; min-height: 0; overflow-y: auto; padding: 24px; display: flex; flex-direction: column; gap: 20px; }
.about-panel-header h2 { margin: 0 0 6px 0; font-size: 18px; color: var(--panel-heading); }
.about-panel-meta { margin: 0; font-size: 13px; color: var(--panel-meta); }
.about-card { background: var(--bg-tertiary); border-radius: 8px; padding: 16px 20px; max-width: 480px; display: flex; flex-direction: column; gap: 10px; }
.about-row { display: flex; justify-content: space-between; font-size: 13px; color: var(--text-secondary); }
.about-key { color: var(--panel-meta); }
</style>
