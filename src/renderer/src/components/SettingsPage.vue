<template>
  <div class="settings-page">
    <!-- 设置内容区 -->
    <div class="settings-content">
      <!-- 左侧分类导航 -->
      <div class="settings-nav">
        <div
          v-for="category in categories"
          :key="category.key"
          class="nav-item"
          :class="{ active: activeCategory === category.key }"
          @click="activeCategory = category.key"
        >
          {{ category.label }}
        </div>
        <div class="nav-footer">
          <el-button class="btn-primary" size="small" @click="resetSettings">{{ t('settings.reset') }}</el-button>
        </div>
      </div>

      <!-- 右侧设置项 -->
      <div class="settings-panel">
        <div>
        <!-- 基本设置 -->
        <div v-if="activeCategory === 'basic'" class="settings-group">
          <!-- 基本配置 -->
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.language') }}</span>
              </div>
              <el-select v-model="settings.language" size="small" style="width: 120px">
                <el-option :label="t('languages.zh-CN')" value="zh-CN" />
                <el-option :label="t('languages.en-US')" value="en-US" />
              </el-select>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.minimizeToTray') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.minimizeToTray" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.preventSleep') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.preventSleep" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.maxDisplayText') }}</span>
                <span class="label-desc">{{ t('basicSettings.maxDisplayTextDesc') }}</span>
              </div>
              <div class="slider-control">
                <el-slider
                  v-model="settings.maxDisplayText"
                  :min="1"
                  :max="100"
                  :step="1"
                  :show-tooltip="false"
                  style="width: 120px"
                />
                <span class="slider-value">{{ settings.maxDisplayText }} MB</span>
              </div>
            </div>
          </div>

          <!-- 显示 -->
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.display') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollToast') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollToast" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollOnFocus') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollOnFocus" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollAfterSend') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollAfterSend" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoScrollOnWheel') }}</span>
                <span class="label-desc">{{ t('basicSettings.autoScrollOnWheelDesc') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoScrollOnWheel" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">界面主题</span>
                <span class="label-desc">切换深色主题和浅色主题</span>
              </div>
              <el-radio-group v-model="settings.themeMode" size="small" class="mode-radio-group">
                <el-radio-button label="dark">深色主题</el-radio-button>
                <el-radio-button label="light">浅色主题</el-radio-button>
              </el-radio-group>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">壁纸/皮肤</span>
                <span class="label-desc">从 plugins/themes 目录切换壁纸主题</span>
              </div>
              <div class="theme-select-wrapper">
                <el-select v-model="settings.themePluginId" size="small" style="width: 220px">
                  <el-option label="默认壁纸" value="" />
                  <el-option
                    v-for="plugin in themePlugins"
                    :key="plugin.id"
                    :label="plugin.name"
                    :value="plugin.id"
                  />
                </el-select>
                <el-button size="small" class="btn-primary" @click="refreshThemePlugins">
                  {{ t('common.refresh') }}
                </el-button>
                <el-button size="small" @click="openThemePluginsDirectory">
                  打开主题目录
                </el-button>
              </div>
            </div>
            <div class="setting-item theme-preview-item">
              <div class="theme-preview-block">
                <div v-if="selectedThemePlugin" class="theme-preview-card">
                  <img
                    v-if="selectedThemePlugin.previewImageUrl"
                    :src="selectedThemePlugin.previewImageUrl"
                    :alt="selectedThemePlugin.name"
                    class="theme-preview-image"
                  />
                  <div class="theme-preview-meta">
                    <span class="theme-preview-name">{{ selectedThemePlugin.name }}</span>
                    <span class="theme-preview-id">{{ selectedThemePlugin.id }}</span>
                  </div>
                </div>
                <div class="theme-folder-hint">
                  主题插件目录：{{ themePluginsRoot || '-' }}
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- 串口设置 -->
        <div v-else-if="activeCategory === 'serial'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('serialSettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('serialSettings.supportedBaudRates') }}</span>
              </div>
              <div class="baudrate-tags">
                <el-tag
                  v-for="rate in settings.supportedBaudRates"
                  :key="rate"
                  closable
                  size="small"
                  effect="dark"
                  @close="removeBaudRate(rate)"
                  class="baudrate-tag"
                >
                  {{ rate }}
                </el-tag>
                <el-input
                  v-if="addingBaudRate"
                  ref="baudRateInputRef"
                  v-model="newBaudRate"
                  size="small"
                  style="width: 80px"
                  @keyup.enter="confirmAddBaudRate"
                  @blur="confirmAddBaudRate"
                />
                <el-button v-else size="small" text type="primary" @click="startAddBaudRate">+ {{ t('serialSettings.addNew') }}</el-button>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('serialSettings.showPortType') }}</span>
                <span class="label-desc">{{ t('serialSettings.showPortTypeDesc') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.showPortType" />
            </div>
          </div>
        </div>

        <!-- 日志 -->
        <div v-else-if="activeCategory === 'log'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('logSettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.enableLogStorage') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.enableLogStorage" />
            </div>
            <template v-if="settings.enableLogStorage">
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.logSplitSize') }}</span>
                <span class="label-desc">{{ t('logSettings.logSplitSizeDesc') }}</span>
              </div>
              <div class="slider-control">
                <el-slider
                  v-model="settings.logSplitSize"
                  :min="1"
                  :max="100"
                  :step="1"
                  :show-tooltip="false"
                  style="width: 120px"
                />
                <span class="slider-value">{{ settings.logSplitSize }} MB</span>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.logPath') }}</span>
              </div>
              <div class="path-input-wrapper">
                <el-input v-model="settings.logPath" size="small" :placeholder="t('logSettings.logPathPlaceholder')" class="path-input" />
                <el-button size="small" @click="selectLogDir" class="btn-primary path-btn">{{ t('logSettings.selectDir') }}</el-button>
              </div>
            </div>
            <div class="setting-item filename-hint-item">
              <div class="filename-hint">
                <span class="hint-title">{{ t('logSettings.dirNameHint') }}</span>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('logSettings.logFileName') }}</span>
              </div>
              <el-input v-model="settings.logFileName" size="small" :placeholder="t('logSettings.logFileNamePlaceholder')" style="width: 280px" />
            </div>
            <div class="setting-item filename-hint-item">
              <div class="filename-hint">
                <span class="hint-title">{{ t('logSettings.fileNameHint') }}:</span>
                <div class="hint-grid">
                  <span class="hint-tag"><code>%C</code> {{ t('logSettings.hintC') }}</span>
                  <span class="hint-tag"><code>%R</code> {{ t('logSettings.hintR') }}</span>
                  <span class="hint-tag"><code>%Y</code> {{ t('logSettings.hintY') }}</span>
                  <span class="hint-tag"><code>%M</code> {{ t('logSettings.hintM') }}</span>
                  <span class="hint-tag"><code>%D</code> {{ t('logSettings.hintD') }}</span>
                  <span class="hint-tag"><code>%h</code> {{ t('logSettings.hintH') }}</span>
                  <span class="hint-tag"><code>%m</code> {{ t('logSettings.hintm') }}</span>
                  <span class="hint-tag"><code>%s</code> {{ t('logSettings.hints') }}</span>
                  <span class="hint-tag"><code>%f</code> {{ t('logSettings.hintf') }}</span>
                </div>
                <span class="hint-subtitle">{{ t('logSettings.fileNameHintPad') }}: <code>%MM</code> <code>%DD</code> <code>%hh</code> <code>%mm</code> <code>%ss</code> <code>%fff</code></span>
              </div>
            </div>
            </template>
          </div>
        </div>

        <!-- 语法高亮 -->
        <div v-else-if="activeCategory === 'syntax'" class="settings-group syntax-embed-group">
          <SyntaxHighlightPage />
        </div>

        <!-- 命令历史 -->
        <div v-else-if="activeCategory === 'history'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('historySettings.title') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('historySettings.showCommandHistory') }}</span>
                <span class="label-desc">{{ t('historySettings.showCommandHistoryDesc') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.showCommandHistory" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('historySettings.commandHistoryMaxCount') }}</span>
                <span class="label-desc">{{ t('historySettings.commandHistoryMaxCountDesc') }}</span>
              </div>
              <div class="slider-control">
                <el-slider
                  v-model="settings.commandHistoryMaxCount"
                  :min="1"
                  :max="100"
                  :step="1"
                  :show-tooltip="false"
                  style="width: 120px"
                />
                <span class="slider-value">{{ settings.commandHistoryMaxCount }} {{ t('historySettings.commandHistoryMaxCountUnit') }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- 备份与恢复 -->
        <div v-else-if="activeCategory === 'backup'" class="settings-group">
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.backup') }}</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.autoBackup') }}</span>
              </div>
              <el-switch class="terminal-switch" v-model="settings.autoBackup" />
            </div>
            <div class="setting-item" v-if="settings.autoBackup">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.backupInterval') }}</span>
                <span class="label-desc">
                  <template v-if="nextBackupDate">
                    {{ t('basicSettings.nextBackupDate') }}：
                    <span class="next-backup-value" :class="{ today: nextBackupDate === todayStr }">
                      {{ nextBackupDate === todayStr ? t('basicSettings.nextBackupDateToday') : nextBackupDate }}
                    </span>
                  </template>
                </span>
              </div>
              <el-select v-model="settings.backupInterval" size="small" style="width: 100px" @change="refreshNextBackupDate">
                <el-option :label="`1 ${t('basicSettings.day')}`" :value="1" />
                <el-option :label="`3 ${t('basicSettings.day')}`" :value="3" />
                <el-option :label="`7 ${t('basicSettings.day')}`" :value="7" />
                <el-option :label="`15 ${t('basicSettings.day')}`" :value="15" />
                <el-option :label="`30 ${t('basicSettings.day')}`" :value="30" />
                <el-option :label="`60 ${t('basicSettings.day')}`" :value="60" />
                <el-option :label="`180 ${t('basicSettings.day')}`" :value="180" />
              </el-select>
            </div>
          </div>

          <!-- 恢复 -->
          <div class="group-section">
            <div class="group-title">{{ t('basicSettings.restore') }}</div>
            <div class="setting-item restore-header-item">
              <div class="setting-label">
                <span class="label-text">{{ t('basicSettings.restoreList') }}</span>
                <span class="label-desc">{{ t('basicSettings.restoreListDesc') }}</span>
              </div>
              <el-button type="text" icon="Refresh" @click="refreshBackupList" size="small" class="icon-text-button">
                {{ t('common.refresh') }}
              </el-button>
            </div>
            <div v-if="backupList.length === 0" class="no-backups">
              {{ t('basicSettings.noBackups') }}
            </div>
            <div v-else class="backup-list">
              <div
                v-for="item in backupList"
                :key="item.date"
                class="backup-item"
                :class="{ selected: selectedBackup === item.date }"
                @click="selectedBackup = item.date"
              >
                <div class="backup-date">{{ item.date }}</div>
                <div class="backup-size">{{ formatSize(item.size) }}</div>
              </div>
            </div>
            <div v-if="backupList.length > 0" class="restore-action">
              <el-button
                size="small"
                :disabled="!selectedBackup"
                @click="handleRestoreBackup"
                class="btn-primary"
              >
                {{ t('basicSettings.restoreBtn') }}
              </el-button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted, nextTick, computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElMessageBox } from 'element-plus'
import { setLocale } from '../locales'
import SyntaxHighlightPage from './SyntaxHighlightPage.vue'

const { t } = useI18n()

const activeCategory = ref('basic')

// 标记：是否已通过事件切换到指定分类（避免 loadActiveCategory 覆盖）
let pendingCategorySwitch: string | null = null

// 加载上次选中的设置分类
const loadActiveCategory = async () => {
  try {
    const appSettings = await window.storageApi.getAppSettings()
    // 如果有 pending 切换，优先使用 pending 值
    if (pendingCategorySwitch) {
      activeCategory.value = pendingCategorySwitch
      pendingCategorySwitch = null
    } else if (appSettings?.settingsActiveCategory) {
      activeCategory.value = appSettings.settingsActiveCategory
    }
  } catch {
    // ignore
  }
}

// 保存选中的设置分类
const saveActiveCategory = async () => {
  try {
    const currentSettings = await window.storageApi.getAppSettings()
    await window.storageApi.saveAppSettings({
      ...currentSettings,
      settingsActiveCategory: activeCategory.value
    })
  } catch {
    // ignore
  }
}

const categories = computed(() => [
  { key: 'basic', label: t('settingsNav.basic') },
  { key: 'serial', label: t('settingsNav.serial') },
  { key: 'log', label: t('settingsNav.log') },
  { key: 'syntax', label: t('settingsNav.syntax') },
  { key: 'history', label: t('settingsNav.history') },
  { key: 'backup', label: t('settingsNav.backup') }
])

// 默认配置从后端获取
const defaultSettings = ref<Record<string, any>>({})

const settings = ref<Record<string, any>>({})
const themePlugins = ref<ThemePluginInfo[]>([])
const themePluginsRoot = ref('')
let isLoading = true

const selectedThemePlugin = computed(() =>
  themePlugins.value.find((plugin) => plugin.id === settings.value.themePluginId) || null
)

const loadDefaultSettings = async () => {
  try {
    const data = await window.storageApi.getDefaultSettings()
    if (data && typeof data === 'object') {
      defaultSettings.value = data
    }
  } catch (error) {
    console.error(t('common.loadFailed'), error)
  }
}

const loadSettings = async () => {
  try {
    const data = await window.storageApi.getSettings()
    if (data && typeof data === 'object') {
      settings.value = { ...defaultSettings.value, ...data }
      isLoading = false
    }
  } catch (error) {
    console.error(t('common.loadFailed'), error)
  }
}

const loadThemePlugins = async () => {
  try {
    const [plugins, rootDir] = await Promise.all([
      window.storageApi.getThemePlugins(),
      window.storageApi.getThemePluginsRoot()
    ])
    themePlugins.value = Array.isArray(plugins) ? plugins : []
    themePluginsRoot.value = rootDir || ''
  } catch (error) {
    console.error('Failed to load theme plugins:', error)
  }
}

const refreshThemePlugins = async () => {
  await loadThemePlugins()
}

const openThemePluginsDirectory = async () => {
  try {
    if (!themePluginsRoot.value) {
      await loadThemePlugins()
    }
    if (themePluginsRoot.value) {
      await window.toolApi.showItemInFolder(themePluginsRoot.value)
    }
  } catch (error) {
    console.error('Failed to open theme plugin directory:', error)
  }
}

const saveSettings = async () => {
  try {
    const plainSettings = JSON.parse(JSON.stringify(settings.value))
    await window.storageApi.saveSettings(plainSettings)
    window.dispatchEvent(new CustomEvent('settings-updated', { detail: plainSettings }))
    // 通知主进程设置更新（用于防止屏幕息屏功能）
    window.toolApi?.notifySettingsUpdate(plainSettings)
  } catch (error) {
    console.error(t('common.saveFailed'), error)
  }
}

// 监听设置变化，自动保存
watch(settings, () => {
  if (!isLoading) {
    saveSettings()
  }
}, { deep: true })

// 监听语言设置变化，实时切换界面语言
watch(() => settings.value.language, (newLocale) => {
  if (newLocale && (newLocale === 'zh-CN' || newLocale === 'en-US')) {
    setLocale(newLocale)
  }
})

const resetSettings = async () => {
  try {
    await ElMessageBox.confirm(t('settings.resetConfirm'), t('settings.reset'), {
      confirmButtonText: t('settings.confirm'),
      cancelButtonText: t('settings.cancel'),
      type: 'warning',
      center: true,
      cancelButtonClass: 'el-button--danger'
    })
    settings.value = JSON.parse(JSON.stringify(defaultSettings.value))
    ElMessage.success(t('settings.resetSuccess'))
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error(t('common.operationFailed'), error)
    }
  }
}

// 波特率管理
const addingBaudRate = ref(false)
const newBaudRate = ref('')
const baudRateInputRef = ref()

const removeBaudRate = (rate: number) => {
  const rates = settings.value.supportedBaudRates
  if (rates.length > 1) {
    settings.value.supportedBaudRates = rates.filter(r => r !== rate)
  } else {
    ElMessage.warning(t('serialSettings.atLeastOneRate'))
  }
}

const startAddBaudRate = () => {
  addingBaudRate.value = true
  nextTick(() => {
    baudRateInputRef.value?.focus()
  })
}

const confirmAddBaudRate = () => {
  const rate = parseInt(newBaudRate.value)
  if (isNaN(rate) || rate <= 0) {
    ElMessage.warning(t('serialSettings.invalidBaudRate'))
  } else if (settings.value.supportedBaudRates.includes(rate)) {
    ElMessage.warning(t('serialSettings.rateExists'))
  } else {
    settings.value.supportedBaudRates.push(rate)
    settings.value.supportedBaudRates.sort((a, b) => a - b)
  }
  addingBaudRate.value = false
  newBaudRate.value = ''
}

// 选择日志保存目录
const selectLogDir = async () => {
  try {
    const result = await window.dialogApi.openFileDialog({
      properties: ['openDirectory']
    })
    if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
      settings.value.logPath = result.filePaths[0]
    }
  } catch (error) {
    console.error('Failed to select directory:', error)
  }
}

// 备份恢复相关
const backupList = ref<{ date: string; size: number }[]>([])
const selectedBackup = ref<string | null>(null)
const nextBackupDate = ref<string | null>(null)

// 今天日期字符串
const todayStr = (() => {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
})()

const refreshNextBackupDate = async () => {
  if (!settings.value.autoBackup) {
    nextBackupDate.value = null
    return
  }
  try {
    nextBackupDate.value = await window.storageApi.getNextBackupDate(settings.value.backupInterval)
  } catch (error) {
    console.error('Failed to get next backup date:', error)
  }
}

const refreshBackupList = async () => {
  try {
    backupList.value = await window.storageApi.getBackupList()
    selectedBackup.value = null
  } catch (error) {
    console.error('Failed to get backup list:', error)
  }
}

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

const handleRestoreBackup = async () => {
  if (!selectedBackup.value) return
  try {
    await ElMessageBox.confirm(
      t('basicSettings.restoreConfirm', { date: selectedBackup.value }),
      t('basicSettings.restoreBtn'),
      {
        confirmButtonText: t('settings.confirm'),
        cancelButtonText: t('settings.cancel'),
        type: 'warning',
        center: true,
        cancelButtonClass: 'el-button--danger'
      }
    )
    const result = await window.storageApi.restoreBackup(selectedBackup.value)
    if (result.success) {
      ElMessage.success(t('basicSettings.restoreSuccess', { date: selectedBackup.value }))
      selectedBackup.value = null
    } else {
      ElMessage.error(result.message || t('basicSettings.restoreFailed'))
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(t('basicSettings.restoreFailed'))
    }
  }
}

// 监听分类切换，进入备份页时自动刷新列表
watch(activeCategory, (newCat) => {
  if (newCat === 'backup') {
    refreshBackupList()
    refreshNextBackupDate()
  }
  saveActiveCategory()
})

// 监听 autoBackup 开关变化
watch(() => settings.value?.autoBackup, () => {
  refreshNextBackupDate()
})

onMounted(async () => {
  // 先注册事件监听，确保在 loadActiveCategory 完成前收到事件也能处理
  window.addEventListener('settings-updated', handleSettingsUpdated)
  window.addEventListener('open-syntax-highlight-page', switchToSyntaxCategory)

  await loadDefaultSettings()
  await loadThemePlugins()
  await loadSettings()
  await loadActiveCategory()
})

onUnmounted(() => {
  window.removeEventListener('settings-updated', handleSettingsUpdated)
  window.removeEventListener('open-syntax-highlight-page', switchToSyntaxCategory)
})

// 切换到语法高亮分类
const switchToSyntaxCategory = () => {
  activeCategory.value = 'syntax'
  pendingCategorySwitch = 'syntax'
  saveActiveCategory()
}

// 设置更新处理
const handleSettingsUpdated = (event: Event) => {
  const updatedSettings = (event as CustomEvent).detail
  if (updatedSettings && 'supportedBaudRates' in updatedSettings) {
    // 刷新波特率列表显示（使用 splice 保持响应性）
    settings.value.supportedBaudRates.splice(0, settings.value.supportedBaudRates.length, ...updatedSettings.supportedBaudRates)
  }
}
</script>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}

.settings-search {
  flex-shrink: 0;
  padding: 8px;
  background: transparent;
}

.search-inner {
  position: relative;
  width: 100%;
  height: 32px;
}

.search-input {
  width: 100%;
  height: 100%;
  padding: 0 28px 0 12px;
  border: 1px solid transparent;
  background-color: var(--theme-input-bg, #3c3c3c);
  color: var(--theme-input-text, #cccccc);
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: var(--focus-border-color);
  box-shadow: 0 0 0 1px var(--focus-border-color) inset;
}

.clear-btn {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--theme-placeholder-color, #9ca3af);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.clear-btn:hover {
  color: var(--theme-text-primary, #111827);
}

.settings-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-nav {
  width: 140px;
  background: var(--app-surface-bg, #252526);
  border-right: 1px solid var(--app-border-color, #3c3c3c);
  padding: 8px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.nav-item {
  padding: 8px 16px;
  color: var(--theme-text-primary, #e0e0e0);
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.nav-item:hover {
  background: var(--theme-hover-overlay, #2a2d2e);
}

.nav-item.active {
  background: var(--menu-item-hover-bg, #094771);
  color: var(--theme-accent-hover-text, #fff);
}

.nav-footer {
  margin-top: auto;
  padding: 16px 8px;
  border-top: 1px solid var(--app-border-color, #3c3c3c);
}



.settings-panel {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.settings-panel:has(.syntax-embed-group) {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.settings-panel:has(.syntax-embed-group) > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.settings-group {
  max-width: 700px;
}

.syntax-embed-group {
  max-width: none;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.syntax-embed-group :deep(.syntax-page) {
  height: 100%;
  background: transparent;
}

.group-section {
  background: var(--app-surface-strong-bg, #252526);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.group-section:last-child {
  margin-bottom: 0;
}

/* ---- 搜索结果 ---- */
.search-results {
  max-width: 700px;
}

.search-empty {
  color: var(--theme-text-muted, #808080);
  font-size: 14px;
  text-align: center;
  padding: 40px 0;
}

.search-result-section {
  background: var(--app-surface-strong-bg, #252526);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.search-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--app-border-color, #3c3c3c);
  font-size: 12px;
  color: var(--theme-text-muted, #888);
  cursor: pointer;
  transition: color 0.15s;
}

.search-section-header:hover {
  color: var(--theme-text-primary, #ccc);
}

.search-category {
  color: var(--focus-border-color);
  font-weight: 600;
}

.search-section {
  color: var(--theme-text-primary, #ccc);
  font-weight: 600;
}

.search-result-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
  border-bottom: 1px solid var(--app-border-color, #333);
  cursor: pointer;
  transition: background 0.15s;
}

.search-result-item:last-child {
  border-bottom: none;
}

.search-result-item:hover {
  background: var(--app-surface-bg, #2a2d2e);
  margin: 0 -12px;
  padding-left: 12px;
  padding-right: 12px;
  border-radius: 4px;
}

.search-label {
  color: var(--theme-text-primary, #e0e0e0);
  font-size: 13px;
}

.search-label :deep(.search-highlight),
.search-desc :deep(.search-highlight) {
  background: #6b4c0a;
  color: #ffd866;
  border-radius: 2px;
  padding: 0 2px;
  font-weight: 600;
}

.search-desc {
  color: var(--theme-text-muted, #808080);
  font-size: 11px;
}

/* 左侧导航匹配计数 */
.nav-item .match-count {
  margin-left: auto;
  background: var(--focus-border-color);
  color: #fff;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 18px;
  text-align: center;
}

.nav-item.has-match {
  color: var(--focus-border-color);
}

.nav-item.has-match:hover {
  color: #0098ff;
}

.group-title {
  color: var(--theme-text-primary, #e8e8e8);
  font-size: 15px;
  font-weight: 700;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 2px solid #409eff;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--app-border-color, #3c3c3c);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.label-text {
  color: var(--theme-text-primary, #e0e0e0);
  font-size: 13px;
}

.label-desc {
  color: var(--theme-text-muted, #808080);
  font-size: 11px;
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.theme-select-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.slider-value {
  color: var(--theme-text-primary, #e0e0e0);
  font-size: 12px;
  min-width: 50px;
  text-align: right;
}

.path-input-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.path-input {
  width: 240px;
}

.path-btn {
  flex-shrink: 0;
  width: auto !important;
}

.filename-hint-item {
  flex-direction: column;
  align-items: flex-start !important;
}

.theme-preview-item {
  align-items: stretch;
  justify-content: flex-start;
}

.theme-preview-block {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.theme-preview-card {
  width: min(100%, 320px);
  border: 1px solid var(--app-border-color, #3c3c3c);
  border-radius: 8px;
  overflow: hidden;
  background: var(--app-surface-strong-bg, rgba(45, 45, 45, 0.92));
}

.theme-preview-image {
  display: block;
  width: 100%;
  height: 140px;
  object-fit: cover;
  background: #1e1e1e;
}

.theme-preview-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
}

.theme-preview-name {
  color: var(--theme-text-primary, #e8e8e8);
  font-size: 13px;
  font-weight: 600;
}

.theme-preview-id,
.theme-folder-hint {
  color: var(--theme-text-muted, #909399);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-all;
}

.filename-hint {
  width: 100%;
  padding: 8px 0 0 0;
}

.hint-title {
  color: #808080;
  font-size: 11px;
  font-weight: 600;
  margin-bottom: 4px;
  display: block;
}

.hint-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 4px 0;
}

.hint-tag {
  color: #999;
  font-size: 11px;
  white-space: nowrap;
}

.hint-tag code {
  background: #3c3c3c;
  color: #e0c060;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

.hint-subtitle {
  color: #808080;
  font-size: 11px;
  display: block;
  margin-top: 4px;
}

.hint-subtitle code {
  background: #3c3c3c;
  color: #e0c060;
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 10px;
}

/* Switch 样式与 TerminalControl 一致 */
:deep(.el-switch) {
  --el-switch-on-color: #165dff;
  --el-switch-off-color: #444;
}

/* Slider 样式与 Switch 一致 */
:deep(.el-slider__runway) {
  background-color: #444;
}

:deep(.el-slider__bar) {
  background-color: #165dff;
}

.baudrate-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-width: 300px;
  align-items: center;
}

.baudrate-tag {
  background: #3c3c3c;
  border-color: #555;
  color: #e0e0e0;
}

.baudrate-tag:hover {
  background: #4c4c4c;
}

/* 滚动条美化 */
.settings-panel::-webkit-scrollbar {
  width: 10px;
}

.settings-panel::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.settings-panel::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 5px;
}

.settings-panel::-webkit-scrollbar-thumb:hover {
  background: #4f4f4f;
}

.settings-panel::-webkit-scrollbar-corner {
  background: #1e1e1e;
}

/* 备份恢复样式 */
.restore-header-item {
  padding-bottom: 4px;
}

.no-backups {
  color: #808080;
  font-size: 13px;
  text-align: center;
  padding: 20px 0;
}

.backup-list {
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
}

.backup-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #3c3c3c;
  cursor: pointer;
  transition: background 0.15s;
}

.backup-item:last-child {
  border-bottom: none;
}

.backup-item:hover {
  background: #2a2d2e;
}

.backup-item.selected {
  background: #094771;
}

.backup-date {
  color: #e0e0e0;
  font-size: 13px;
}

.backup-size {
  color: #808080;
  font-size: 12px;
}

.restore-action {
  padding: 12px 0 0 0;
  border-top: 1px solid #3c3c3c;
  margin-top: 8px;
}

.restore-action .el-button {
  width: 100%;
}

.backup-list::-webkit-scrollbar {
  width: 6px;
}

.backup-list::-webkit-scrollbar-track {
  background: #252526;
}

.backup-list::-webkit-scrollbar-thumb {
  background: #424242;
  border-radius: 3px;
}

.backup-list::-webkit-scrollbar-thumb:hover {
  background: #4f4f4f;
}

.next-backup-value {
  color: #e0e0e0;
  font-size: 13px;
  font-weight: 500;
}

.next-backup-value.today {
  color: #f0a020;
}


</style>
