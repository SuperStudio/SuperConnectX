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
            <span class="progress-text">{{ cpuUsage }}%</span>
          </div>
        </div>
      </div>
      <div class="resource-item">
        <div class="progress-bar">
          <div
            class="progress mem-progress"
            :style="{ width: `${memRate}%`, backgroundColor: getProgressColor(memRate) }"
          >
            <span class="progress-text">{{ memRate }}% {{ memoryUsage }} MB</span>
          </div>
        </div>
      </div>
    </div>
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
    // memoryUsage.value = data.memory
    // memRate.value = data.memRate
    memoryUsage.value = data.memory
    memRate.value = 1
  } catch (error) {
    console.error('获取资源数据失败：', error)
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

/* 横向排列容器 */
.progress-container {
  display: flex;
  gap: 3px; /* 两个进度条之间的间距 */
  width: 100%;
}

.resource-item {
  flex: 1; /* 两个进度条平分宽度 */
}

.progress-bar {
  height: 18px;
  width: 100%;
  background-color: #e0e0e055;
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
  color: #fff;
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
