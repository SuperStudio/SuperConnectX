<template>
  <div class="app-container app-shell">
    <header class="app-shell-titlebar">
      <slot name="titlebar" />
    </header>
    <main class="app-shell-main">
      <slot />
    </main>
    <footer v-if="$slots.statusbar" class="app-shell-statusbar">
      <slot name="statusbar" />
    </footer>
  </div>
</template>

<style scoped>
.app-shell {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  color: var(--text-white);
  overflow: hidden;
}

.app-shell-titlebar,
.app-shell-statusbar {
  flex-shrink: 0;
}

.app-shell-main {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
