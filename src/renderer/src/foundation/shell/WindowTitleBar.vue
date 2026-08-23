<template>
  <header class="window-titlebar">
    <div class="window-titlebar-left"><slot name="left" /></div>
    <div class="window-titlebar-right">
      <slot name="right" />
      <button class="window-control" type="button" aria-label="Minimize window" @click="$emit('minimize')">
        <svg fill="currentColor" width="20" height="20" viewBox="0 0 1024 900" xmlns="http://www.w3.org/2000/svg"><path d="M256 469.333333m42.666667 0l426.666666 0q42.666667 0 42.666667 42.666667t-42.666667 42.666667l-426.666666 0q-42.666667 0-42.666667-42.666667t42.666667-42.666667Z" /></svg>
      </button>
      <button class="window-control" type="button" :aria-label="isMaximized ? 'Restore window' : 'Maximize window'" @click="$emit('toggleMaximize')">
        <svg v-if="isMaximized" fill="currentColor" width="12" height="12" viewBox="0 0 1024 900" xmlns="http://www.w3.org/2000/svg"><path d="M646.4 938.667H224C147.2 938.667 85.333 876.8 85.333 800V377.6c0-76.8 61.867-138.667 138.667-138.667h422.4c76.8 0 138.667 61.867 138.667 138.667V800c0 76.8-61.867 138.667-138.667 138.667zM224 302.933c-40.533 0-74.667 34.134-74.667 74.667V800c0 40.533 34.134 74.667 74.667 74.667h422.4c40.533 0 74.667-34.134 74.667-74.667V377.6c0-40.533-34.134-74.667-74.667-74.667H224z" /><path d="M793.6 785.067c-17.067 0-32-14.934-32-32s14.933-32 32-32c44.8 0 81.067-36.267 81.067-81.067V224c0-42.667-32-74.667-74.667-74.667H386.133c-44.8 0-81.066 36.267-81.066 81.067 0 17.067-14.934 32-32 32s-32-14.933-32-32c-2.134-81.067 64-145.067 145.066-145.067h416C878.933 85.333 940.8 147.2 940.8 224v416c-2.133 78.933-66.133 145.067-147.2 145.067z" /></svg>
        <svg v-else viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="currentColor"><path d="M770.9 923.3H253.1c-83.8 0-151.9-68.2-151.9-151.9V253.6c0-83.8 68.2-151.9 151.9-151.9h517.8c83.8 0 151.9 68.2 151.9 151.9v517.8c0 83.8-68.1 151.9-151.9 151.9zM253.1 181.7c-39.7 0-71.9 32.3-71.9 71.9v517.8c0 39.7 32.3 71.9 71.9 71.9h517.8c39.7 0 71.9-32.3 71.9-71.9V253.6c0-39.7-32.3-71.9-71.9-71.9H253.1z" /></svg>
      </button>
      <button class="window-control close-control" type="button" aria-label="Close window" @click="$emit('close')">
        <svg fill="currentColor" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg" width="20" height="20"><path d="M512 451.669333l165.973333-165.973333a21.333333 21.333333 0 0 1 30.122667 0l30.165333 30.208a21.333333 21.333333 0 0 1 0 30.165333L572.330667 512l165.973333 165.973333a21.333333 21.333333 0 0 1 0 30.122667l-30.208 30.165333a21.333333 21.333333 0 0 1-30.165333 0L512 572.330667l-165.973333 165.973333a21.333333 21.333333 0 0 1-30.122667 0l-30.165333-30.208a21.333333 21.333333 0 0 1 0-30.165333L451.669333 512l-165.973333-165.973333a21.333333 21.333333 0 0 1 0-30.122667l30.208-30.165333a21.333333 21.333333 0 0 1 30.165333 0L512 451.669333z" /></svg>
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
defineProps<{ isMaximized: boolean }>()
defineEmits<{ minimize: []; toggleMaximize: []; close: [] }>()
</script>

<style scoped>
.window-titlebar { height: 30px; background-color: var(--bg-titlebar); color: var(--text-titlebar); display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-primary); user-select: none; -webkit-app-region: drag; }
.window-titlebar-left { min-width: 0; display: flex; align-items: center; }
.window-titlebar-right { display: flex; margin-left: auto; -webkit-app-region: no-drag; }
.window-control { width: 40px; height: 30px; padding: 0; background: none; border: none; color: var(--text-white); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background-color 0.2s; }
.window-control:hover { background-color: var(--overlay-hover); }
.close-control:hover { background-color: var(--btn-close-hover); }
.window-control:focus { outline: none; }
</style>
