<template>
  <div class="virtualport-page">
    <!-- 非 Windows 系统提示 -->
    <div v-if="!isWindows" class="not-supported">
      <el-empty :description="t('virtualPort.notSupported')" :image-size="80" />
    </div>

    <!-- Windows 系统正常显示 -->
    <template v-else>
    <!-- 校验区域 -->
    <div class="checks-section">
      <div class="check-item">
        <div class="check-label">
          <el-icon :size="16" :color="virtualPortInstalled ? 'var(--connect-dot-connected)' : 'var(--connect-dot-disconnected)'">
            <CircleCheck v-if="virtualPortInstalled" />
            <CircleClose v-else />
          </el-icon>
          <span>{{ t('virtualPort.checkInstalled') }}</span>
        </div>
      </div>

      <div class="check-item check-item-vertical">
        <div class="check-label">
          <el-icon :size="16" :color="virtualPortPathSelected ? 'var(--connect-dot-connected)' : 'var(--connect-dot-disconnected)'">
            <CircleCheck v-if="virtualPortPathSelected" />
            <CircleClose v-else />
          </el-icon>
          <span>{{ t('virtualPort.checkPath') }}</span>
        </div>
        <div class="path-selector">
          <el-input
            v-model="virtualPortPath"
            :placeholder="t('virtualPort.pathPlaceholder')"
            size="small"
            style="flex: 1"
          />
          <el-button size="small" class="btn-primary" style="width: auto !important" @click="handleSelectPath">
            {{ t('virtualPort.selectPath') }}
          </el-button>
        </div>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar-section">
      <el-button size="small" class="btn-primary toolbar-btn" icon="Plus" @click="handleAddPair">
        {{ t('virtualPort.addPair') }}
      </el-button>
      <el-button size="small" class="btn-primary toolbar-btn" icon="Refresh" @click="handleRefresh">
        {{ t('virtualPort.refresh') }}
      </el-button>
    </div>

    <!-- 虚拟串口列表 -->
    <div class="pair-list-section">
      <el-table
        :data="pairList"
        style="width: 100%"
        size="small"
        empty-text=""
        v-if="pairList.length > 0"
      >
        <el-table-column :label="t('common.delete')" width="60" align="center">
          <template #default="{ row }">
            <el-icon size="16" class="action-icon delete-icon" @click="handleRemovePair(row)">
              <Delete />
            </el-icon>
          </template>
        </el-table-column>
        <el-table-column :label="t('virtualPort.pairIndex')" width="80" align="center">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column prop="portA" :label="t('virtualPort.portA')" />
        <el-table-column prop="portB" :label="t('virtualPort.portB')" />

      </el-table>

      <div v-else class="empty-pair-list">
        <el-empty :description="t('virtualPort.noPairs')" :image-size="80" />
      </div>
    </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleCheck, CircleClose, Delete } from '@element-plus/icons-vue'

const { t } = useI18n()

// 是否为 Windows 系统
const isWindows = ref(window.virtualPortApi.getPlatform() === 'win32')

// 校验状态
const virtualPortInstalled = ref(false)
const virtualPortPathSelected = ref(false)
const virtualPortPath = ref('')

// 虚拟串口列表
interface VirtualPortPair {
  portA: string
  portB: string
  active: boolean
}

const pairList = reactive<VirtualPortPair[]>([])

// 刷新列表
const refreshPorts = async () => {
  try {
    const pairs = await window.virtualPortApi.listPorts()
    pairList.length = 0
    for (const p of pairs) {
      pairList.push({
        portA: p.portA || '',
        portB: p.portB || '',
        active: p.portA !== '' && p.portB !== ''
      })
    }
  } catch (error) {
    console.error('[VirtualPortPage] listPorts failed:', error)
  }
}

// 检测两个虚拟串口条件
const checkConditions = async () => {
  try {
    console.log('[VirtualPortPage] calling checkConditions...')
    const result = await window.virtualPortApi.checkConditions()
    console.log('[VirtualPortPage] checkConditions result:', JSON.stringify(result))
    virtualPortInstalled.value = result.installed
    virtualPortPathSelected.value = result.pathSelected
    virtualPortPath.value = result.path
  } catch (error) {
    console.error('[VirtualPortPage] checkConditions failed:', error)
  }
}

// 组件挂载时检测条件并加载列表（仅 Windows）
onMounted(() => {
  if (isWindows.value) {
    checkConditions()
    refreshPorts()
  }
})

// 选择虚拟串口程序路径
const handleSelectPath = () => {
  // TODO: 实现路径选择
}

// 新增串口对
const handleAddPair = () => {
  // TODO: 实现新增串口对
}

// 刷新列表
const handleRefresh = () => {
  refreshPorts()
}

// 启用串口对
const handleActivatePair = (_row: VirtualPortPair) => {
  // TODO: 实现启用
}

// 停用串口对
const handleDeactivatePair = (_row: VirtualPortPair) => {
  // TODO: 实现停用
}

// 删除串口对
const handleRemovePair = (_row: VirtualPortPair) => {
  // TODO: 实现删除
}
</script>

<style scoped>
.virtualport-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0px;
  box-sizing: border-box;
  overflow-y: auto;
  background-color: var(--terminal-bg);
}

/* 校验区域 */
.checks-section {
  background-color: var(--panel-bg);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 16px;
}

.check-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
}

.check-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 8px;
  padding-bottom: 12px;
}

.check-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-primary);
}

.check-item-vertical {
  flex-direction: column;
  align-items: flex-start;
}

.path-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

/* 工具栏 */
.toolbar-section {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0px 20px 0 20px;
  margin-bottom: 16px;
}

.toolbar-btn {
  width: 120px !important;
  justify-content: center;
}

/* 列表区域 */
.pair-list-section {
  flex: 1;
  min-height: 0;
}

.pair-list-section :deep(.el-table) {
  --el-table-bg-color: var(--panel-bg);
  --el-table-tr-bg-color: var(--panel-bg);
  --el-table-header-bg-color: var(--table-header-bg);
  --el-table-border-color: var(--border-color);
  --el-table-text-color: var(--text-primary);
  --el-table-header-text-color: var(--text-secondary);
  border-radius: 8px;
  overflow: hidden;
}

.pair-list-section :deep(.el-table__body tr) {
  background: var(--panel-bg);
}

.pair-list-section :deep(.el-table__body tr:hover > td) {
  background: var(--shortcuts-table-row-hover) !important;
}

.pair-list-section :deep(.el-table__body td) {
  background: var(--panel-bg);
  border-bottom: 1px solid var(--shortcuts-table-row-border) !important;
}

.pair-list-section :deep(.el-table__body .el-table__row--striped td) {
  background: var(--shortcuts-table-stripe-bg) !important;
}

.empty-pair-list {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  background-color: var(--panel-bg);
  border-radius: 8px;
}

/* 删除图标 */
.action-icon {
  cursor: pointer;
  transition: all 0.2s ease !important;
  opacity: 0.8 !important;
}

.action-icon:hover {
  transform: scale(1.1) !important;
  opacity: 1 !important;
}

.delete-icon {
  color: var(--preset-delete-icon-color);
}

.delete-icon:hover {
  color: var(--preset-delete-icon-hover) !important;
}
</style>
