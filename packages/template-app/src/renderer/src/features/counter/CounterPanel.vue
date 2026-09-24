<template>
  <div class="counter-panel">
    <header class="counter-panel-header">
      <h2>Persistent Counter</h2>
      <p class="counter-panel-meta">
        Demonstrates the foundation → features → components layering with a
        fully-typed, JSON-safe IPC contract.
      </p>
    </header>

    <div class="counter-card">
      <div class="counter-display">{{ formatted }}</div>
      <div class="counter-controls">
        <button class="btn btn-secondary" type="button" :disabled="isLoading" @click="reset">Reset</button>
        <button class="btn btn-primary" type="button" :disabled="isLoading" @click="increment">+1</button>
      </div>
      <div v-if="lastError" class="counter-error" role="alert">{{ lastError }}</div>
    </div>

    <details class="counter-explanation">
      <summary>How this panel talks to the main process</summary>
      <ul>
        <li><code>useCounter()</code> in <code>features/counter/</code> owns the IPC choreography.</li>
        <li>Read calls (<code>get</code>, <code>reset</code>) have no payload and bypass the contextBridge proxy trap.</li>
        <li>Write calls (<code>set</code>) JSON-clone the payload before invoke — see the rule in <code>preload/index.ts</code>.</li>
        <li>Channel names live in <code>shared/ipc/counter.ts</code> so renderer / preload / main stay in sync.</li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCounter } from './useCounter'

const { value, isLoading, lastError, increment, reset } = useCounter()

const formatted = computed(() => value.value.toLocaleString())
</script>

<style scoped>
.counter-panel {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.counter-panel-header h2 {
  margin: 0 0 6px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--panel-heading);
}

.counter-panel-meta {
  margin: 0;
  font-size: 13px;
  color: var(--panel-meta);
  line-height: 1.5;
}

.counter-card {
  background: var(--counter-card-bg);
  border: 1px solid var(--counter-card-border);
  border-radius: 8px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.counter-display {
  font-size: 48px;
  font-weight: 600;
  background: var(--counter-display-bg);
  color: var(--counter-display-text);
  padding: 16px 32px;
  border-radius: 8px;
  font-variant-numeric: tabular-nums;
  min-width: 200px;
  text-align: center;
}

.counter-controls {
  display: flex;
  gap: 12px;
}

.btn {
  padding: 8px 18px;
  border-radius: 4px;
  border: 0;
  font-size: 14px;
  cursor: pointer;
  transition: background-color 0.2s, opacity 0.2s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--btn-primary); color: var(--btn-primary-text); }
.btn-primary:hover:not(:disabled) { background: var(--btn-primary-hover); }
.btn-secondary { background: var(--btn-secondary); color: var(--text-white); }
.btn-secondary:hover:not(:disabled) { background: var(--btn-secondary-hover); }

.counter-error {
  font-size: 13px;
  color: var(--btn-danger);
}

.counter-explanation {
  font-size: 13px;
  color: var(--text-secondary);
  background: var(--bg-tertiary);
  border-radius: 6px;
  padding: 12px 16px;
}
.counter-explanation summary { cursor: pointer; font-weight: 500; }
.counter-explanation ul { margin: 8px 0 0 0; padding-left: 20px; }
.counter-explanation li { margin-bottom: 4px; }
.counter-explanation code { background: var(--bg-secondary); padding: 1px 5px; border-radius: 3px; font-size: 12px; }
</style>
