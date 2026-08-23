<template>
  <div class="status-bar">
    <div class="status-bar-left"><slot name="left" /></div>
    <div class="status-bar-center"><slot name="center" /></div>
    <div class="status-bar-right"><slot name="right" /></div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 25px;
  display: flex;
  align-items: stretch;
  background-color: var(--statusbar-bg-hover);
}

.status-bar-left,
.status-bar-center,
.status-bar-right {
  display: flex;
  align-items: center;
  min-width: 0;
}

.status-bar-center {
  flex: 1;
  justify-content: center;
}

.status-bar-right {
  margin-left: auto;
}
</style>
