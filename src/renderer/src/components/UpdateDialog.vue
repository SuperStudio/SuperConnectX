<template>
  <el-dialog
    v-model="visible"
    :title="dialogTitle"
    width="460px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    @close="handleClose"
  >
    <div class="update-content">
      <!-- 检查中 -->
      <div v-if="status === 'checking'" class="update-status">
        <el-icon class="status-icon spinning" :size="40"><Loading /></el-icon>
        <p class="status-text">{{ t('update.checking') }}</p>
      </div>

      <!-- 已是最新版本 -->
      <div v-else-if="status === 'update-not-available'" class="update-status">
        <el-icon class="status-icon success" :size="40"><CircleCheck /></el-icon>
        <p class="status-text">{{ t('update.upToDate') }}</p>
        <p class="status-subtext">{{ t('update.currentVersion', { version: currentVersion }) }}</p>
        <p v-if="updateInfo?.releaseDate" class="status-subtext release-date">{{ t('update.releaseDate') }}: {{ formatDate(updateInfo.releaseDate) }}</p>
      </div>

      <!-- 发现新版本 -->
      <div v-else-if="status === 'update-available'" class="update-status">
        <el-icon class="status-icon info" :size="40"><InfoFilled /></el-icon>
        <p class="status-text">{{ t('update.newVersionAvailable', { version: updateInfo?.version }) }}</p>
        <p class="status-subtext">{{ t('update.currentVersion', { version: currentVersion }) }} → <strong>{{ updateInfo?.version }}</strong></p>
        <p v-if="updateInfo?.releaseDate" class="status-subtext release-date">{{ t('update.releaseDate') }}: {{ formatDate(updateInfo.releaseDate) }}</p>

        <!-- 更新日志 -->
        <div v-if="updateInfo?.releaseNotes" class="release-notes">
          <div class="release-notes-title">{{ t('update.releaseNotes') }}</div>
          <div class="release-notes-content" v-html="formatReleaseNotes(updateInfo.releaseNotes)"></div>
        </div>
      </div>

      <!-- 下载进度 -->
      <div v-else-if="status === 'download-progress'" class="update-status">
        <el-icon class="status-icon spinning" :size="40"><Loading /></el-icon>
        <p class="status-text">{{ t('update.downloading') }}</p>
        <div class="progress-wrapper">
          <el-progress
            :percentage="progressInfo?.percent || 0"
            :stroke-width="12"
            :color="progressColor"
          />
        </div>
        <p class="status-subtext">
          {{ formatSize(progressInfo?.transferred || 0) }} / {{ formatSize(progressInfo?.total || 0) }}
          <span v-if="progressInfo?.bytesPerSecond"> · {{ formatSpeed(progressInfo.bytesPerSecond) }}</span>
        </p>
      </div>

      <!-- 下载完成 -->
      <div v-else-if="status === 'update-downloaded'" class="update-status">
        <el-icon class="status-icon success" :size="40"><CircleCheck /></el-icon>
        <p class="status-text">{{ t('update.downloadComplete') }}</p>
        <p class="status-subtext">{{ t('update.restartPrompt') }}</p>
      </div>

      <!-- 错误 -->
      <div v-else-if="status === 'error' || status === 'check-error'" class="update-status">
        <el-icon class="status-icon error" :size="40"><CircleClose /></el-icon>
        <p class="status-text">{{ t('update.error') }}</p>
        <p class="status-subtext">{{ errorMessage }}</p>
      </div>
    </div>

    <template #footer>
      <div class="update-footer">
        <el-button v-if="canRetry" class="btn-primary" style="width: auto !important" @click="handleRetry">
          {{ t('update.retry') }}
        </el-button>
        <el-button v-if="status === 'update-not-available'" class="btn-primary" style="width: auto !important" @click="handleClose">
          {{ t('common.close') }}
        </el-button>
        <el-button v-else-if="canClose" class="btn-cancel" style="width: auto !important" @click="handleClose">
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          v-if="status === 'update-available'"
          class="btn-primary"
          @click="handleStartDownload"
        >
          {{ t('update.startUpdate') }}
        </el-button>
        <el-button
          v-if="status === 'update-available'"
          class="website-btn"
          @click="handleOpenWebsite"
        >
          {{ t('update.openWebsite') }}
        </el-button>
        <el-button
          v-if="status === 'update-available'"
          icon="Refresh"
          class="recheck-btn"
          @click="handleRecheck"
        >
          {{ t('update.recheck') }}
        </el-button>
        <el-button
          v-if="status === 'download-progress'"
          class="btn-cancel"
          style="width: auto !important"
          @click="handleCancelDownload"
        >
          {{ t('common.cancel') }}
        </el-button>
        <el-button
          v-if="status === 'update-downloaded'"
          class="btn-primary"
          @click="handleRestart"
        >
          {{ t('update.restartNow') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Loading, CircleCheck, CircleClose, InfoFilled } from '@element-plus/icons-vue'

const { t } = useI18n()

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const status = ref<string>('checking')
const updateInfo = ref<{ version: string; releaseDate?: string; releaseNotes?: string; files?: Array<{ url: string; size: number }> } | null>(null)
const progressInfo = ref<{ percent: number; transferred: number; total: number; bytesPerSecond: number } | null>(null)
const errorMessage = ref('')
const currentVersion = ref('')

const progressColor = computed(() => {
  const pct = progressInfo.value?.percent || 0
  if (pct < 30) return '#e6a23c'
  if (pct < 70) return '#409eff'
  return '#67c23a'
})

const dialogTitle = computed(() => {
  switch (status.value) {
    case 'checking': return t('update.checking')
    case 'update-available': return t('update.newVersionAvailable', { version: updateInfo.value?.version || '' })
    case 'download-progress': return t('update.downloadingTitle', { percent: progressInfo.value?.percent || 0 })
    case 'update-downloaded': return t('update.downloadComplete')
    case 'update-not-available': return t('update.checkUpdate')
    case 'error':
    case 'check-error': return t('update.error')
    default: return t('update.checkUpdate')
  }
})

const canRetry = computed(() => status.value === 'error' || status.value === 'check-error')
const canClose = computed(() =>
  status.value === 'update-not-available' ||
  status.value === 'error' ||
  status.value === 'check-error'
)

const formatReleaseNotes = (notes: string): string => {
  // 检查是否已经是 HTML 内容
  if (/<[a-zA-Z]/.test(notes)) {
    // 已经是 HTML，压缩多余空行后只保留必要的换行
    return notes
      .replace(/\n{3,}/g, '\n\n')        // 多个空行压缩为1个
      .replace(/\n\n/g, '<br><br>')       // 双换行 -> 段落间隔
      .replace(/\n/g, '')                 // 单换行在 HTML 中无意义，移除
  }
  // 纯文本/Markdown 格式，按 Markdown 转换
  return notes
    // 先转义 HTML
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // 标题
    .replace(/^### (.+)$/gm, '<h4 style="margin:10px 0 4px;color:#ddd">$1</h4>')
    .replace(/^## (.+)$/gm, '<h3 style="margin:12px 0 6px;color:#eee">$1</h3>')
    .replace(/^# (.+)$/gm, '<h2 style="margin:14px 0 8px;color:#fff">$1</h2>')
    // 粗体
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 行内代码
    .replace(/`([^`]+)`/g, '<code style="background:#2a2a2a;padding:1px 4px;border-radius:3px;font-family:monospace">$1</code>')
    // 无序列表
    .replace(/^- (.+)$/gm, '<li style="margin:2px 0">$1</li>')
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul style="margin:4px 0;padding-left:18px">$1</ul>')
    // 换行
    .replace(/\n/g, '<br>')
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const formatSpeed = (bytesPerSecond: number): string => {
  if (bytesPerSecond < 1024) return bytesPerSecond.toFixed(0) + ' B/s'
  if (bytesPerSecond < 1024 * 1024) return (bytesPerSecond / 1024).toFixed(1) + ' KB/s'
  return (bytesPerSecond / (1024 * 1024)).toFixed(1) + ' MB/s'
}

const formatDate = (dateStr: string): string => {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return dateStr
  return d.toLocaleDateString()
}

let removeListener: (() => void) | null = null

const ensureListener = () => {
  if (removeListener) return
  removeListener = window.updateApi.onUpdateStatus((data) => {
    status.value = data.status
    if (data.data) {
      switch (data.status) {
        case 'update-available':
          updateInfo.value = data.data
          break
        case 'update-not-available':
          updateInfo.value = data.data
          break
        case 'download-progress':
          progressInfo.value = data.data
          break
        case 'update-downloaded':
          updateInfo.value = { ...updateInfo.value, version: data.data.version }
          break
        case 'error':
        case 'check-error':
          errorMessage.value = data.data?.message || t('update.unknownError')
          break
      }
    }
  })
}

const handleRecheck = () => {
  status.value = 'checking'
  errorMessage.value = ''
  updateInfo.value = null
  progressInfo.value = null
  ensureListener()
  window.updateApi.checkForUpdates()
}

const handleStartDownload = () => {
  status.value = 'download-progress'
  progressInfo.value = { percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 }
  window.updateApi.startDownload()
}

const handleOpenWebsite = () => {
  const repoUrl = 'https://github.com/SuperStudio/SuperConnectX'
  const tagVersion = updateInfo.value?.version || currentVersion.value
  const url = `${repoUrl}/releases/tag/v${tagVersion}`
  window.toolApi.openExternalUrl(url)
}

const handleCancelDownload = () => {
  window.updateApi.cancelDownload()
}

const handleRestart = () => {
  window.updateApi.quitAndInstall()
}

const handleRetry = () => {
  status.value = 'checking'
  errorMessage.value = ''
  ensureListener()
  window.updateApi.checkForUpdates()
}

const handleClose = () => {
  if (status.value === 'download-progress') {
    window.updateApi.cancelDownload()
  }
  visible.value = false
}

const open = async () => {
  visible.value = true
  progressInfo.value = null
  errorMessage.value = ''

  // 获取当前版本
  try {
    currentVersion.value = await window.windowApi.getAppVersion()
  } catch {
    currentVersion.value = 'unknown'
  }

  // 检查是否有缓存的更新信息
  const cached = await window.updateApi.getCachedUpdateInfo()
  if (cached && cached.version) {
    status.value = 'update-available'
    updateInfo.value = cached
    return
  }

  status.value = 'checking'
  updateInfo.value = null

  // 注册更新状态监听
  ensureListener()

  // 触发检查
  try {
    await window.updateApi.checkForUpdates()
  } catch {
    // 错误通过事件处理
  }
}

watch(visible, (val) => {
  if (!val && removeListener) {
    removeListener()
    removeListener = null
  }
})

defineExpose({ open })
</script>

<style scoped>
.update-content {
  padding: 8px 0;
  min-height: 120px;
}

.update-status {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 8px;
}

.status-icon {
  color: var(--update-status-icon-color);
}

.status-icon.success {
  color: var(--update-color-100);
}

.status-icon.error {
  color: var(--color-danger);
}

.status-icon.info {
  color: var(--update-color-70);
}

.status-icon.spinning {
  animation: spin 1.2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-text {
  color: var(--update-text);
  font-size: 15px;
  font-weight: 600;
  margin: 4px 0;
}

.status-subtext {
  color: var(--update-meta);
  font-size: 13px;
  margin: 0;
}

.release-notes {
  width: 100%;
  margin-top: 8px;
  background: var(--update-bg);
  border: 1px solid var(--update-border);
  border-radius: 6px;
  padding: 10px;
  text-align: left;
  max-height: 200px;
  overflow-y: auto;
}

.release-date {
  color: var(--update-empty);
  font-size: 12px;
  margin-top: 2px;
}

.release-notes-title {
  color: var(--update-changelog);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 6px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--update-changelog-border);
}

.release-notes-content {
  color: var(--update-changelog-link);
  font-size: 12px;
  line-height: 1.6;
}

.progress-wrapper {
  width: 100%;
  margin: 8px 0;
}

.progress-wrapper :deep(.el-progress-bar__outer) {
  background-color: var(--update-progress-bg);
}

.update-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}

.website-btn {
  background-color: var(--update-website-btn-bg) !important;
  border: 1px solid var(--update-website-btn-border) !important;
  color: var(--update-website-btn-color) !important;
}

.website-btn:hover {
  background-color: var(--update-website-btn-hover-bg) !important;
  border-color: var(--update-website-btn-hover-border) !important;
  color: var(--update-website-btn-hover-color) !important;
}

.recheck-btn {
  background-color: var(--update-website-btn-bg) !important;
  border: 1px solid var(--update-website-btn-border) !important;
  color: var(--update-website-btn-color) !important;
}

.recheck-btn:hover {
  background-color: var(--update-website-btn-hover-bg) !important;
  border-color: var(--update-website-btn-hover-border) !important;
  color: var(--update-website-btn-hover-color) !important;
  transform: translateY(-1px);
}

.recheck-btn:disabled {
  cursor: not-allowed !important;
  opacity: 0.5 !important;
}

/* 滚动条 */
.release-notes::-webkit-scrollbar {
  width: 6px;
}

.release-notes::-webkit-scrollbar-track {
  background: transparent;
}

.release-notes::-webkit-scrollbar-thumb {
  background: var(--update-progress-bar-bg);
  border-radius: 3px;
}

.release-notes::-webkit-scrollbar-thumb:hover {
  background: var(--update-progress-bar-fill);
}
</style>
