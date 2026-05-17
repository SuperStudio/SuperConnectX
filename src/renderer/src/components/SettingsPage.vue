<template>
  <div class="settings-page">
    <!-- 搜索框 -->
    <div class="settings-search">
      <div class="search-inner">
        <input
          type="text"
          placeholder="搜索设置..."
          v-model="searchKeyword"
          class="search-input"
        />
        <button class="clear-btn" @click="searchKeyword = ''" v-if="searchKeyword">×</button>
      </div>
    </div>

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
          <el-button size="small" @click="resetSettings">恢复默认</el-button>
        </div>
      </div>

      <!-- 右侧设置项 -->
      <div class="settings-panel">
        <!-- 基本设置 -->
        <div v-if="activeCategory === 'basic'" class="settings-group">
          <!-- 语言 -->
          <div class="group-section">
            <div class="group-title">语言</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">界面语言</span>
                <span class="label-desc">选择界面显示语言</span>
              </div>
              <el-select v-model="settings.language" size="small" style="width: 120px">
                <el-option label="简体中文" value="zh-CN" />
                <el-option label="English" value="en-US" />
              </el-select>
            </div>
          </div>

          <!-- 基本配置 -->
          <div class="group-section">
            <div class="group-title">基本配置</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">关闭后最小化到托盘</span>
                <span class="label-desc">关闭窗口时最小化到系统托盘而不是退出程序</span>
              </div>
              <el-switch v-model="settings.minimizeToTray" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">日志分片大小</span>
                <span class="label-desc">单个日志文件最大大小（MB）</span>
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
          </div>

          <!-- 显示 -->
          <div class="group-section">
            <div class="group-title">显示</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">固定滚屏</span>
                <span class="label-desc">终端自动滚动到最新输出</span>
              </div>
              <el-switch v-model="settings.autoScroll" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">固定滚屏时弹出提示</span>
                <span class="label-desc">当滚屏被固定时显示提示信息</span>
              </div>
              <el-switch v-model="settings.autoScrollToast" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">获得焦点时固定</span>
                <span class="label-desc">鼠标点击终端区域时自动固定滚屏</span>
              </div>
              <el-switch v-model="settings.autoScrollOnFocus" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">发送命令后停止滚屏</span>
                <span class="label-desc">发送命令后自动取消固定滚屏</span>
              </div>
              <el-switch v-model="settings.autoScrollAfterSend" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">鼠标滚动决策固定</span>
                <span class="label-desc">滚动鼠标时提示是否固定滚屏</span>
              </div>
              <el-switch v-model="settings.autoScrollOnWheel" />
            </div>
          </div>

          <!-- 备份 -->
          <div class="group-section">
            <div class="group-title">备份</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">自动备份</span>
                <span class="label-desc">自动备份连接和命令配置</span>
              </div>
              <el-switch v-model="settings.autoBackup" />
            </div>
            <div class="setting-item" v-if="settings.autoBackup">
              <div class="setting-label">
                <span class="label-text">备份周期</span>
                <span class="label-desc">自动备份的间隔天数</span>
              </div>
              <el-select v-model="settings.backupInterval" size="small" style="width: 100px">
                <el-option label="1 天" :value="1" />
                <el-option label="3 天" :value="3" />
                <el-option label="7 天" :value="7" />
                <el-option label="15 天" :value="15" />
                <el-option label="30 天" :value="30" />
                <el-option label="60 天" :value="60" />
                <el-option label="180 天" :value="180" />
              </el-select>
            </div>
          </div>

          <!-- 系统 -->
          <div class="group-section">
            <div class="group-title">系统</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">开机自启</span>
                <span class="label-desc">系统启动时自动运行程序</span>
              </div>
              <el-switch v-model="settings.autoStart" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">防止屏幕息屏及系统休眠</span>
                <span class="label-desc">阻止系统进入休眠或屏幕关闭</span>
              </div>
              <el-switch v-model="settings.preventSleep" />
            </div>
          </div>
        </div>

        <!-- 串口设置 -->
        <div v-else-if="activeCategory === 'serial'" class="settings-group">
          <div class="group-section">
            <div class="group-title">串口设置</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">支持的波特率列表</span>
                <span class="label-desc">管理串口连接时可选的波特率</span>
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
                <el-button v-else size="small" text type="primary" @click="startAddBaudRate">+ 新增</el-button>
              </div>
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">显示串口类型</span>
                <span class="label-desc">在串口列表中显示类型标签（虚拟串口、USB、蓝牙）</span>
              </div>
              <el-switch v-model="settings.showPortType" />
            </div>
          </div>
        </div>

        <!-- 日志 -->
        <div v-else-if="activeCategory === 'log'" class="settings-group">
          <div class="group-section">
            <div class="group-title">日志存储</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">启用日志存储</span>
                <span class="label-desc">将终端输出保存到日志文件</span>
              </div>
              <el-switch v-model="settings.enableLogStorage" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">日志保存路径</span>
                <span class="label-desc">日志文件的存储位置</span>
              </div>
              <el-input v-model="settings.logPath" size="small" style="width: 200px" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">最大日志大小</span>
                <span class="label-desc">单个日志文件最大大小（MB）</span>
              </div>
              <el-input-number v-model="settings.maxLogSize" size="small" :min="1" :max="100" style="width: 100px" />
            </div>
          </div>

          <div class="group-section">
            <div class="group-title">日志格式</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">时间戳</span>
                <span class="label-desc">每行日志前添加时间戳</span>
              </div>
              <el-switch v-model="settings.logTimestamp" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">十六进制显示</span>
                <span class="label-desc">以十六进制格式显示日志</span>
              </div>
              <el-switch v-model="settings.logHex" />
            </div>
          </div>
        </div>

        <!-- 语法高亮 -->
        <div v-else-if="activeCategory === 'syntax'" class="settings-group">
          <div class="group-section">
            <div class="group-title">语法高亮</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">启用语法高亮</span>
                <span class="label-desc">对命令输出进行语法着色</span>
              </div>
              <el-switch v-model="settings.enableSyntaxHighlight" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">高亮主题</span>
                <span class="label-desc">语法高亮颜色方案</span>
              </div>
              <el-select v-model="settings.syntaxTheme" size="small" style="width: 120px">
                <el-option label="暗色" value="dark" />
                <el-option label="亮色" value="light" />
              </el-select>
            </div>
          </div>
        </div>

        <!-- 搜索 -->
        <div v-else-if="activeCategory === 'search'" class="settings-group">
          <div class="group-section">
            <div class="group-title">搜索设置</div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">区分大小写</span>
                <span class="label-desc">搜索时区分英文字母大小写</span>
              </div>
              <el-switch v-model="settings.searchCaseSensitive" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">正则表达式</span>
                <span class="label-desc">启用正则表达式搜索</span>
              </div>
              <el-switch v-model="settings.searchRegex" />
            </div>
            <div class="setting-item">
              <div class="setting-label">
                <span class="label-text">整词匹配</span>
                <span class="label-desc">只匹配完整的单词</span>
              </div>
              <el-switch v-model="settings.searchWholeWord" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'

const searchKeyword = ref('')
const activeCategory = ref('basic')

const categories = [
  { key: 'basic', label: '基本设置' },
  { key: 'serial', label: '串口设置' },
  { key: 'log', label: '日志' },
  { key: 'syntax', label: '语法高亮' },
  { key: 'search', label: '搜索' }
]

// 默认配置从后端获取
const defaultSettings = ref<Record<string, any>>({})

const settings = ref<Record<string, any>>({})
let isLoading = true

const loadDefaultSettings = async () => {
  try {
    const data = await window.storageApi.getDefaultSettings()
    if (data && typeof data === 'object') {
      defaultSettings.value = data
    }
  } catch (error) {
    console.error('加载默认设置失败:', error)
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
    console.error('加载设置失败:', error)
  }
}

const saveSettings = async () => {
  try {
    const plainSettings = JSON.parse(JSON.stringify(settings.value))
    await window.storageApi.saveSettings(plainSettings)
    window.dispatchEvent(new CustomEvent('settings-updated', { detail: plainSettings }))
  } catch (error) {
    console.error('保存设置失败:', error)
  }
}

// 监听设置变化，自动保存
watch(settings, () => {
  if (!isLoading) {
    saveSettings()
  }
}, { deep: true })

const resetSettings = async () => {
  try {
    await ElMessageBox.confirm('确定要恢复默认设置吗？', '恢复默认设置', {
      confirmButtonText: '确认',
      cancelButtonText: '取消',
      type: 'warning',
      center: true,
      confirmButtonClass: 'el-button--primary',
      cancelButtonClass: 'el-button--danger'
    })
    settings.value = JSON.parse(JSON.stringify(defaultSettings.value))
    ElMessage.success('已恢复默认设置')
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error('恢复默认设置失败:', error)
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
    ElMessage.warning('至少保留一个波特率')
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
    ElMessage.warning('请输入有效的波特率')
  } else if (settings.value.supportedBaudRates.includes(rate)) {
    ElMessage.warning('该波特率已存在')
  } else {
    settings.value.supportedBaudRates.push(rate)
    settings.value.supportedBaudRates.sort((a, b) => a - b)
  }
  addingBaudRate.value = false
  newBaudRate.value = ''
}

onMounted(async () => {
  await loadDefaultSettings()
  await loadSettings()
})
</script>

<style scoped>
.settings-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
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
  background-color: #3c3c3c;
  color: #cccccc;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #007fd4;
  box-shadow: 0 0 0 1px #007fd4 inset;
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
  color: #9ca3af;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.clear-btn:hover {
  color: #111827;
}

.settings-content {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.settings-nav {
  width: 140px;
  background: #252526;
  border-right: 1px solid #3c3c3c;
  padding: 8px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

.nav-item {
  padding: 8px 16px;
  color: #e0e0e0;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}

.nav-item:hover {
  background: #2a2d2e;
}

.nav-item.active {
  background: #094771;
  color: #fff;
}

.nav-footer {
  margin-top: auto;
  padding: 16px 8px;
  border-top: 1px solid #3c3c3c;
}

.nav-footer .el-button {
  width: 100%;
  background-color: #0e639c;
  border: none;
  color: #fff;
}

.nav-footer .el-button:hover {
  background-color: #1177bb;
}

.settings-panel {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.settings-group {
  max-width: 700px;
}

.group-section {
  background: #252526;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 16px;
}

.group-section:last-child {
  margin-bottom: 0;
}

.group-title {
  color: #cccccc;
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #3c3c3c;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid #3c3c3c;
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
  color: #e0e0e0;
  font-size: 13px;
}

.label-desc {
  color: #808080;
  font-size: 11px;
}

.slider-control {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-value {
  color: #e0e0e0;
  font-size: 12px;
  min-width: 50px;
  text-align: right;
}

/* Switch 样式与 TerminalControl 一致 */
:deep(.el-switch) {
  --el-switch-on-color: #165dff;
  --el-switch-off-color: #444;
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
</style>
