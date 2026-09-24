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
          <el-icon :size="16" :color="(virtualPortInstalled && virtualPortPathSelected) ? 'var(--connect-dot-connected)' : 'var(--connect-dot-disconnected)'">
            <CircleCheck v-if="virtualPortInstalled && virtualPortPathSelected" />
            <CircleClose v-else />
          </el-icon>
          <span>{{ t('virtualPort.checkInstalled') }}</span>
          <!-- 已安装：显示路径（只读） -->
          <el-input
            v-if="virtualPortInstalled && virtualPortPathSelected"
            v-model="virtualPortPath"
            :placeholder="t('virtualPort.pathPlaceholder')"
            size="small"
            style="flex: 1"
            disabled
          />
          <!-- 未安装：显示安装按钮 -->
          <el-button
            v-else
            size="small"
            class="btn-primary install-btn"
            :loading="installing"
            style="width: auto !important"
            @click="handleInstall"
          >
            {{ t('virtualPort.clickToInstall') }}
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
      <el-button size="small" class="btn-primary toolbar-btn" @click="handleSave" :loading="saving">
        {{ t('virtualPort.save') }}
      </el-button>
    </div>

    <!-- 虚拟串口列表（每个端口一行） -->
    <div class="port-list-section">
      <el-table
        :data="portList"
        style="width: 100%"
        size="small"
        empty-text=""
        table-layout="auto"
        v-if="portList.length > 0"
      >
        <!-- 删除 -->
        <el-table-column width="50" align="center" fixed="left">
          <template #default="{ row }">
            <el-icon :size="16" class="action-icon delete-icon" @click="handleDeletePair(row)">
              <Delete />
            </el-icon>
          </template>
        </el-table-column>

        <!-- 序号 -->
        <el-table-column :label="t('virtualPort.pairIndex')" width="60" align="center">
          <template #default="{ $index }">{{ $index + 1 }}</template>
        </el-table-column>

        <!-- 串口号 -->
        <el-table-column :label="t('virtualPort.portNumber')" min-width="110">
          <template #default="{ row }">
            <el-input
              v-model="row.Name"
              size="small"
              :placeholder="t('virtualPort.portNumberPlaceholder')"
              maxlength="8"
              @input="row.Name = row.Name.toUpperCase()"
            />
          </template>
        </el-table-column>

        <!-- 绑定串口（只读） -->
        <el-table-column :label="t('virtualPort.pairedPort')" min-width="110" align="center">
          <template #default="{ row }">
            <span class="paired-port-text">{{ row.PairedName || '-' }}</span>
          </template>
        </el-table-column>

        <!-- 隐藏 -->
        <el-table-column :label="t('virtualPort.hidden')" min-width="70" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.HiddenMode" size="small" class="terminal-switch" />
          </template>
        </el-table-column>

        <!-- 模拟波特率 -->
        <el-table-column :label="t('virtualPort.emuBR')" width="100" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.EmuBR" size="small" class="terminal-switch" />
          </template>
        </el-table-column>

        <!-- 缓冲区溢出 -->
        <el-table-column :label="t('virtualPort.emuOverrun')" width="100" align="center">
          <template #default="{ row }">
            <el-switch v-model="row.EmuOverrun" size="small" class="terminal-switch" />
          </template>
        </el-table-column>

        <!-- 模拟真实插拔 -->
        <el-table-column min-width="105" align="center">
          <template #header>
            <span class="col-header">
              {{ t('virtualPort.plugInMode') }}
              <el-tooltip :content="t('virtualPort.plugInModeHint')" placement="top" :show-after="TOOLTIP_SHOW_AFTER" popper-class="col-header-tooltip" :fallback-placements="['bottom']">
                <el-icon :size="14" class="col-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <template #default="{ row }">
            <el-switch v-model="row.PlugInMode" size="small" class="terminal-switch" />
          </template>
        </el-table-column>

        <!-- 独占模式 -->
        <el-table-column min-width="95" align="center">
          <template #header>
            <span class="col-header">
              {{ t('virtualPort.exclusiveMode') }}
              <el-tooltip :content="t('virtualPort.exclusiveModeHint')" placement="top" :show-after="TOOLTIP_SHOW_AFTER" popper-class="col-header-tooltip" :fallback-placements="['bottom']">
                <el-icon :size="14" class="col-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <template #default="{ row }">
            <el-switch v-model="row.ExclusiveMode" size="small" class="terminal-switch" />
          </template>
        </el-table-column>

        <!-- 误码率 -->
        <el-table-column min-width="110">
          <template #header>
            <span class="col-header">
              {{ t('virtualPort.emuNoise') }}
              <el-tooltip :content="t('virtualPort.emuNoiseHint')" placement="top" :show-after="TOOLTIP_SHOW_AFTER" popper-class="col-header-tooltip" :fallback-placements="['bottom']">
                <el-icon :size="14" class="col-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <template #default="{ row }">
            <el-input
              v-model="row.EmuNoise"
              size="small"
              :placeholder="'0'"
              @input="row.EmuNoise = row.EmuNoise.replace(/[^\d.]/g, '')"
            />
          </template>
        </el-table-column>

        <!-- RTTO(ms) -->
        <el-table-column min-width="100">
          <template #header>
            <span class="col-header">
              {{ t('virtualPort.rtto') }}
              <el-tooltip :content="t('virtualPort.rttoHint')" placement="top" :show-after="TOOLTIP_SHOW_AFTER" popper-class="col-header-tooltip" :fallback-placements="['bottom']">
                <el-icon :size="14" class="col-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <template #default="{ row }">
            <el-input
              v-model="row.AddRTTO"
              size="small"
              :placeholder="'0'"
              @input="row.AddRTTO = row.AddRTTO.replace(/\D/g, '')"
            />
          </template>
        </el-table-column>

        <!-- RITO(ms) -->
        <el-table-column min-width="100">
          <template #header>
            <span class="col-header">
              {{ t('virtualPort.rito') }}
              <el-tooltip :content="t('virtualPort.ritoHint')" placement="top-end" :show-after="TOOLTIP_SHOW_AFTER" popper-class="col-header-tooltip" :fallback-placements="['bottom-end']">
                <el-icon :size="14" class="col-help-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </span>
          </template>
          <template #default="{ row }">
            <el-input
              v-model="row.AddRITO"
              size="small"
              :placeholder="'0'"
              @input="row.AddRITO = row.AddRITO.replace(/\D/g, '')"
            />
          </template>
        </el-table-column>
      </el-table>

      <div v-else class="empty-pair-list">
        <el-empty :description="t('virtualPort.noPairs')" :image-size="80" />
      </div>
    </div>

    <!-- 新增串口对对话框 -->
    <el-dialog
      v-model="addPairDialogVisible"
      :title="t('virtualPort.addPairTitle')"
      width="400px"
      :close-on-click-modal="false"
    >
      <el-form :model="addPairForm" label-position="top" @submit.prevent>
        <el-form-item :label="t('virtualPort.addPairPortA')">
          <el-input
            v-model="addPairForm.portA"
            :placeholder="t('virtualPort.addPairPortAPlaceholder')"
            maxlength="6"
            @input="addPairForm.portA = addPairForm.portA.replace(/\D/g, '')"
          >
            <template #prepend>COM</template>
          </el-input>
        </el-form-item>
        <el-form-item :label="t('virtualPort.addPairPortB')">
          <el-input
            v-model="addPairForm.portB"
            :placeholder="t('virtualPort.addPairPortBPlaceholder')"
            maxlength="6"
            @input="addPairForm.portB = addPairForm.portB.replace(/\D/g, '')"
          >
            <template #prepend>COM</template>
          </el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button size="small" class="btn-cancel" style="width: auto !important" @click="addPairDialogVisible = false">
          {{ t('common.cancel') }}
        </el-button>
        <el-button size="small" class="btn-primary" style="width: auto !important" @click="handleConfirmAddPair" :loading="addPairLoading">
          {{ t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { CircleCheck, CircleClose, QuestionFilled, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { isProperPortName } from '@renderer/utils/virtualPort'
import { TOOLTIP_SHOW_AFTER } from '@renderer/utils/constants'

const { t } = useI18n()

// 是否为 Windows 系统
const isWindows = ref(window.virtualPortApi.getPlatform() === 'win32')

// 校验状态
const virtualPortInstalled = ref(false)
const virtualPortPathSelected = ref(false)
const virtualPortPath = ref('')
const installing = ref(false)

// 虚拟串口列表（每个端口一行，携带完整参数）
interface VirtualPortRow {
  ID: string
  Name: string
  /** 配对的端口名称（如 COM6），不可编辑，仅展示 */
  PairedName: string
  EmuBR: boolean
  EmuOverrun: boolean
  EmuNoise: string
  AddRTTO: string
  AddRITO: string
  PlugInMode: boolean
  ExclusiveMode: boolean
  HiddenMode: boolean
}

const portList = reactive<VirtualPortRow[]>([])

// 保存刷新时的原始快照，用于比对变更
const portListSnapshot = ref<VirtualPortRow[]>([])

// 保存/应用状态
const saving = ref(false)

// 新增串口对对话框
const addPairDialogVisible = ref(false)
const addPairLoading = ref(false)
const addPairForm = reactive({
  portA: '',
  portB: ''
})

// 深拷贝 portList 作为快照
function snapshotPortList(): VirtualPortRow[] {
  return portList.map((row) => ({ ...row }))
}

// 根据 ID 找到配对端口名（CNCA0 <-> CNCB0）
function findPairedName(id: string, ports: Array<{ ID: string; Name: string }>): string {
  // ID 格式如 CNCA0 / CNCB0，提取数字后缀
  const match = id.match(/^(CNC[AB])(\d+)$/)
  if (!match) return ''
  const peerPrefix = match[1] === 'CNCA' ? 'CNCB' : 'CNCA'
  const peerId = peerPrefix + match[2]
  const peer = ports.find((p) => p.ID === peerId)
  return peer ? (peer.Name || '') : ''
}

// 刷新列表
const refreshPorts = async () => {
  try {
    const ports = await window.virtualPortApi.listPorts()
    portList.length = 0
    for (const p of ports) {
      portList.push({
        ID: p.ID,
        Name: p.Name || '',
        PairedName: findPairedName(p.ID as string, ports as Array<{ ID: string; Name: string }>),
        EmuBR: !!p.EmuBR,
        EmuOverrun: !!p.EmuOverrun,
        EmuNoise: String(p.EmuNoise ?? ''),
        AddRTTO: String(p.AddRTTO ?? ''),
        AddRITO: String(p.AddRITO ?? ''),
        PlugInMode: !!p.PlugInMode,
        ExclusiveMode: !!p.ExclusiveMode,
        HiddenMode: !!p.HiddenMode
      })
    }
    portListSnapshot.value = snapshotPortList()
  } catch (error) {
    console.error('[VirtualPortPage] listPorts failed:', error)
  }
}

// 检测两个虚拟串口条件
const checkConditions = async () => {
  try {
    const result = await window.virtualPortApi.checkConditions()
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

// 点击安装按钮，运行 setup.exe
const handleInstall = async () => {
  installing.value = true
  try {
    const result = await window.virtualPortApi.runSetup()
    if (result.success) {
      ElMessage.success(t('virtualPort.installLaunched'))
    } else {
      ElMessage.error(result.error || t('virtualPort.installFailed'))
    }
  } catch (error) {
    console.error('[VirtualPortPage] runSetup failed:', error)
    ElMessage.error(t('virtualPort.installFailed'))
  } finally {
    installing.value = false
  }
}

// 打开新增串口对对话框
const handleAddPair = () => {
  if (!virtualPortInstalled.value) {
    ElMessage.warning(t('virtualPort.notInstalled'))
    return
  }
  addPairForm.portA = ''
  addPairForm.portB = ''
  addPairDialogVisible.value = true
}

// 确认新增串口对
const handleConfirmAddPair = async () => {
  const portA = 'COM' + addPairForm.portA.trim()
  const portB = 'COM' + addPairForm.portB.trim()

  if (!isProperPortName(portA) || !isProperPortName(portB)) {
    ElMessage.warning(t('virtualPort.addPairInvalidName'))
    return
  }
  if (portA === portB) {
    ElMessage.warning(t('virtualPort.addPairSameName'))
    return
  }

  addPairLoading.value = true
  try {
    const result = await window.virtualPortApi.insertPair(portA, portB)
    if (result.success) {
      ElMessage.success(t('virtualPort.addPairSuccess'))
      addPairDialogVisible.value = false
      await refreshPorts()
    } else {
      ElMessage.error(result.error || t('virtualPort.addPairFailed'))
    }
  } catch (error) {
    console.error('[VirtualPortPage] insertPair failed:', error)
    ElMessage.error(t('virtualPort.addPairFailed'))
  } finally {
    addPairLoading.value = false
  }
}

// 刷新列表
const handleRefresh = () => {
  refreshPorts()
}

// 从 ID 中提取串口对索引（CNCA0 -> 0, CNCB1 -> 1）
function extractPairIndex(id: string): number | null {
  const match = id.match(/^CNC[AB](\d+)$/)
  return match ? parseInt(match[1], 10) : null
}

// 删除串口对
const handleDeletePair = async (row: VirtualPortRow) => {
  const index = extractPairIndex(row.ID)
  if (index === null) {
    ElMessage.error(t('virtualPort.deletePairFailed'))
    return
  }

  // 构建端口对名称用于确认提示
  const portA = row.Name
  const portB = row.PairedName || '?'

  try {
    await ElMessageBox.confirm(
      t('virtualPort.deletePairConfirm', { portA, portB }),
      t('common.warning'),
      {
        confirmButtonText: t('common.confirm'),
        cancelButtonText: t('common.cancel'),
        type: 'warning',
        center: true
      }
    )

    const result = await window.virtualPortApi.deletePair(index)
    if (result.success) {
      ElMessage.success(t('virtualPort.deletePairSuccess'))
      await refreshPorts()
    } else {
      ElMessage.error(result.error || t('virtualPort.deletePairFailed'))
    }
  } catch (error) {
    // 用户取消也会走到这里
    if (error !== 'cancel' && error !== 'close') {
      console.error('[VirtualPortPage] deletePair failed:', error)
      ElMessage.error(t('virtualPort.deletePairFailed'))
    }
  }
}

// 刷新列表

// 将 VirtualPortRow 转换为 IPC 需要的纯对象
function toPlainPort(row: VirtualPortRow): Record<string, unknown> {
  return {
    ID: row.ID,
    Name: row.Name,
    EmuBR: row.EmuBR,
    EmuOverrun: row.EmuOverrun,
    EmuNoise: parseFloat(row.EmuNoise) || 0,
    AddRTTO: parseInt(row.AddRTTO, 10) || 0,
    AddRITO: parseInt(row.AddRITO, 10) || 0,
    PlugInMode: row.PlugInMode,
    ExclusiveMode: row.ExclusiveMode,
    HiddenMode: row.HiddenMode
  }
}

// 比较两个端口是否一致
function portRowEquals(a: VirtualPortRow, b: VirtualPortRow): boolean {
  return (
    a.ID === b.ID &&
    a.Name === b.Name &&
    a.EmuBR === b.EmuBR &&
    a.EmuOverrun === b.EmuOverrun &&
    a.EmuNoise === b.EmuNoise &&
    a.AddRTTO === b.AddRTTO &&
    a.AddRITO === b.AddRITO &&
    a.PlugInMode === b.PlugInMode &&
    a.ExclusiveMode === b.ExclusiveMode &&
    a.HiddenMode === b.HiddenMode
  )
}

// 保存
const handleSave = async () => {
  saving.value = true
  try {
    // 找出变更的端口（对比快照）
    const changedPorts: VirtualPortRow[] = []
    const snapshotMap = new Map(portListSnapshot.value.map((s) => [s.ID, s]))

    for (const row of portList) {
      const snap = snapshotMap.get(row.ID)
      if (!snap || !portRowEquals(row, snap)) {
        changedPorts.push(row)
      }
    }

    if (changedPorts.length === 0) {
      ElMessage.info(t('virtualPort.noChanges'))
      saving.value = false
      return
    }

    const ports = changedPorts.map(toPlainPort)
    const result = await window.virtualPortApi.updatePorts(ports)
    if (result.success) {
      ElMessage.success(t('virtualPort.updateSuccess'))
      await refreshPorts()
    } else {
      ElMessage.error(result.error || t('virtualPort.updateFailed'))
    }
  } catch (error) {
    console.error('[VirtualPortPage] updatePorts failed:', error)
    ElMessage.error(t('virtualPort.updateFailed'))
  } finally {
    saving.value = false
  }
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
  width: 100%;
}

.install-btn {
  flex-shrink: 0;
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
.port-list-section {
  flex: 1;
  min-height: 0;
  min-width: 0;
}

.col-header {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.col-help-icon {
  color: var(--text-tertiary);
  cursor: help;
  flex-shrink: 0;
}

.col-help-icon:hover {
  color: var(--text-primary);
}

.action-icon {
  cursor: pointer;
  transition: all 0.2s ease !important;
  opacity: 0.8 !important;
  vertical-align: middle;
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

.paired-port-text {
  color: var(--text-secondary);
  font-size: 13px;
}

.port-list-section :deep(.el-table) {
  --el-table-bg-color: var(--panel-bg);
  --el-table-tr-bg-color: var(--panel-bg);
  --el-table-header-bg-color: var(--table-header-bg);
  --el-table-border-color: var(--border-color);
  --el-table-text-color: var(--text-primary);
  --el-table-header-text-color: var(--text-secondary);
  border-radius: 8px;
  overflow: hidden;
}

.port-list-section :deep(.el-table__header-wrapper th) {
  white-space: nowrap;
}

.port-list-section :deep(.el-table__body-wrapper) {
  overflow-x: auto;
}

.port-list-section :deep(.el-table__body tr) {
  background: var(--panel-bg);
}

.port-list-section :deep(.el-table__body tr:hover > td) {
  background: var(--shortcuts-table-row-hover) !important;
}

.port-list-section :deep(.el-table__body td) {
  background: var(--panel-bg);
  border-bottom: 1px solid var(--shortcuts-table-row-border) !important;
}

.port-list-section :deep(.el-table__body .el-table__row--striped td) {
  background: var(--shortcuts-table-stripe-bg) !important;
}

.port-list-section :deep(.el-input__wrapper) {
  padding-left: 8px;
  padding-right: 8px;
}

.empty-pair-list {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  background-color: var(--panel-bg);
  border-radius: 8px;
}

/* 输入框 prepend COM 前缀适配深浅皮肤，无边框 */
:deep(.el-input-group__prepend) {
  background-color: var(--bg-tertiary) !important;
  color: var(--text-primary) !important;
  border: none !important;
  box-shadow: none !important;
  border-radius: 4px 0 0 4px !important;
}
:deep(.el-input-group__prepend + .el-input__wrapper) {
  border-left: none !important;
  box-shadow: 0 0 0 1px var(--border-input) inset !important;
}
:deep(.el-input-group) {
  box-shadow: 0 0 0 1px var(--border-input) inset;
  border-radius: 4px;
}
</style>

<style>
/* 列头 tooltip popper 限制宽度，防止撑开窗口产生滚动条 */
.col-header-tooltip {
  max-width: 280px !important;
  word-break: break-word;
}
</style>
