<template>
  <div class="monitor">
    <!-- 横向排列容器 -->
    <div class="progress-container">
      <div class="resource-item">
        <div class="progress-bar">
          <div
            class="progress cpu-progress"
            :style="{ width: `${cpuUsage}%`, backgroundColor: getProgressColor(cpuUsage) }"
          >
            <span class="progress-text">CPU {{ cpuUsage }}%</span>
          </div>
        </div>
      </div>
      <div class="resource-item">
        <div class="progress-bar">
          <div
            class="progress mem-progress"
            :style="{ width: `${memRate}%`, backgroundColor: getProgressColor(memRate) }"
          >
            <span class="progress-text">内存 {{ memRate }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const cpuUsage = ref(0)
const memRate = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

const fetchResourceData = async () => {
  try {
    const data = await window.toolApi.getAppResource()
    cpuUsage.value = data.cpu
    memRate.value = data.memRate
  } catch (error) {
    console.error('Failed to get resource data:', error)
  }
}

// 根据使用率返回不同颜色
const getProgressColor = (value: number) => {
  if (value < 60) return '#4caf50'
  if (value < 80) return '#ffc107'
  return '#f44336'
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
  padding: 0px;
}

.progress-container {
  display: flex;
  gap: 3px;
  width: 100%;
}

.resource-item {
  flex: 1;
}

.progress-bar {
  height: 18px;
  width: 100%;
  background-color: var(--monitor-bar-bg);
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.progress {
  height: 100%;
  transition: width 0.3s ease;
  display: flex;
  align-items: center;
}

.progress-text {
  color: var(--monitor-text);
  font-weight: 500;
  white-space: nowrap;
  font-size: 12px;
  margin-left: 5px;
  margin-right: 5px;
}

.cpu-progress {
  min-width: 2px;
}
.mem-progress {
  min-width: 5px;
}
</style>
