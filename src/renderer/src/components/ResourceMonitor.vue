<template>
  <div class="monitor">
    <span>mem: {{ memRate }}% {{ memoryUsage }} MB </span>
    <span>cpu: {{ cpuUsage }}% </span>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const cpuUsage = ref(0)
const memoryUsage = ref(0)
const memRate = ref(0)
let timer = null

const fetchResourceData = async () => {
  try {
    const data = await window.electronStore.getAppResource()
    cpuUsage.value = data.cpu
    memoryUsage.value = data.memory
    memRate.value = data.memRate
  } catch (error) {
    console.error('获取资源数据失败：', error)
  }
}

onMounted(() => {
  fetchResourceData()
  timer = setInterval(fetchResourceData, 5000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.monitor {
}
</style>
