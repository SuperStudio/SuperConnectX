<template>
  <div class="resource-monitor">
    <div class="monitor-row">
      <div class="monitor-item">
        <div class="monitor-bar">
          <div
            class="monitor-fill"
            :style="{ width: `${cpuPercent}%`, backgroundColor: progressColor(cpuPercent) }"
          >
            <span class="monitor-text">{{ cpuLabel }} {{ cpuUsage }}%</span>
          </div>
        </div>
      </div>
      <div class="monitor-item">
        <div class="monitor-bar">
          <div
            class="monitor-fill"
            :style="{ width: `${memPercent}%`, backgroundColor: progressColor(memPercent) }"
          >
            <span class="monitor-text">{{ memLabel }} {{ memRate }}%</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

/**
 * ResourceMonitor — 状态栏 CPU / 内存占用率监视条。
 *
 * 基础层不感知任何宿主 IPC：数据源通过必填的 `fetcher` prop 注入
 * （如 `() => window.toolApi.getAppResource()`），返回值只需包含
 * `cpu` 与 `memRate` 字段（字符串或数字均可）。标签文案经 props 注入。
 */
const props = withDefaults(
  defineProps<{
    /** 数据源：返回 { cpu, memRate }（字符串或数字），由宿主桥接到主进程 */
    fetcher: () => Promise<{ cpu: number | string; memRate: number | string }> | { cpu: number | string; memRate: number | string }
    /** 轮询间隔（毫秒） */
    interval?: number
    /** CPU 标签文案 */
    cpuLabel?: string
    /** 内存标签文案 */
    memLabel?: string
  }>(),
  {
    interval: 5000,
    cpuLabel: 'CPU',
    memLabel: 'Memory'
  }
)

const cpuUsage = ref<number | string>('0.00')
const memRate = ref<number | string>('0.00')

const toPercent = (value: number | string): number => {
  const num = Number(value)
  if (Number.isNaN(num) || num < 0) return 0
  return Math.min(num, 100)
}

const cpuPercent = computed(() => toPercent(cpuUsage.value))
const memPercent = computed(() => toPercent(memRate.value))

// 根据使用率返回不同颜色（<60 绿 / <80 黄 / 其余红）
const progressColor = (value: number): string => {
  if (value < 60) return '#4caf50'
  if (value < 80) return '#ffc107'
  return '#f44336'
}

let timer: ReturnType<typeof setInterval> | null = null

const fetchResourceData = async (): Promise<void> => {
  try {
    const data = await props.fetcher()
    cpuUsage.value = data.cpu
    memRate.value = data.memRate
  } catch (error) {
    console.error('Failed to get resource data:', error)
  }
}

onMounted(() => {
  fetchResourceData()
  timer = setInterval(fetchResourceData, props.interval)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.resource-monitor {
  padding: 0;
}

.monitor-row {
  display: flex;
  gap: 3px;
  width: 100%;
}

.monitor-item {
  flex: 1;
}

.monitor-bar {
  height: 18px;
  width: 100%;
  background-color: var(--monitor-bar-bg, var(--statusbar-bg, #2d2d30));
  border-radius: 4px;
  overflow: hidden;
  position: relative;
}

.monitor-fill {
  height: 100%;
  transition: width 0.3s ease;
  display: flex;
  align-items: center;
  min-width: 2px;
}

.monitor-text {
  color: var(--monitor-text, #ffffff);
  font-weight: 500;
  white-space: nowrap;
  font-size: 12px;
  margin-left: 5px;
  margin-right: 5px;
}
</style>
