<template>
  <div class="virtualport-page">
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
        <el-tag v-if="virtualPortInstalled" type="success" size="small">{{ t('virtualPort.installed') }}</el-tag>
        <el-tag v-else type="danger" size="small">{{ t('virtualPort.notInstalled') }}</el-tag>
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
        <el-table-column :label="t('virtualPort.pairIndex')" width="80" align="center">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>
        <el-table-column prop="portA" :label="t('virtualPort.portA')" />
        <el-table-column prop="portB" :label="t('virtualPort.portB')" />
        <el-table-column :label="t('virtualPort.status')" width="120" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.active" type="success" size="small">{{ t('virtualPort.active') }}</el-tag>
            <el-tag v-else type="info" size="small">{{ t('virtualPort.inactive') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('virtualPort.actions')" width="160" align="center">
          <template #default="{ row }">
            <el-button
              v-if="row.active"
              size="small"
              class="btn-cancel"
              @click="handleDeactivatePair(row)"
            >
              {{ t('virtualPort.deactivate') }}
            </el-button>
            <el-button
              v-else
              size="small"
              class="btn-primary"
              @click="handleActivatePair(row)"
            >
              {{ t('virtualPort.activate') }}
            </el-button>
            <el-button
              size="small"
              class="btn-cancel"
              @click="handleRemovePair(row)"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div v-else class="empty-pair-list">
        <el-empty :description="t('virtualPort.noPairs')" :image-size="80" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleCheck, CircleClose } from '@element-plus/icons-vue'

const { t } = useI18n()

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

// 组件挂载时检测条件
onMounted(() => {
  checkConditions()
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
  // TODO: 实现刷新
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

.empty-pair-list {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  background-color: var(--panel-bg);
  border-radius: 8px;
}
</style>
