<template>
  <el-dialog
    :title="t('dialog.newConnection')"
    v-model="dialogVisible"
    width="640px"
    @keydown.enter.native="handleSubmit"
    :close-on-click-modal="false"
  >
    <el-tabs v-model="formData.connectionType" @tab-change="handleProtocolChange" class="protocol-tabs">
      <el-tab-pane label="Telnet" name="telnet" :disabled="isEditMode" />
      <el-tab-pane label="SSH" name="ssh" disabled />
      <el-tab-pane label="FTP" name="ftp" :disabled="isEditMode" />
      <el-tab-pane label="TCP" name="tcp" disabled />
      <el-tab-pane label="UDP" name="udp" disabled />
      <el-tab-pane label="Ping" name="ping" disabled />
      <el-tab-pane label="TFTP" name="tftp" disabled />
      <el-tab-pane label="HTTP" name="http" disabled />
    </el-tabs>
    <el-form :model="formData" :rules="formRules" ref="formRef" label-width="120px" @submit.prevent>
      <el-form-item :label="t('dialog.connectionName')" prop="name">
        <el-input v-model="formData.name" :placeholder="t('dialog.namePlaceholder')" prefix="User" />
      </el-form-item>
      <!-- FTP 模式选择 -->
      <el-form-item :label="t('ftp.mode')" v-if="formData.connectionType === 'ftp'">
        <el-radio-group v-model="formData.ftpMode" class="mode-radio-group">
          <el-radio-button value="server">{{ t('ftp.server') }}</el-radio-button>
          <el-radio-button value="client">{{ t('ftp.client') }}</el-radio-button>
        </el-radio-group>
      </el-form-item>
      <!-- FTP 服务端：端口、账号密码、目录、权限 -->
      <template v-if="formData.connectionType === 'ftp' && formData.ftpMode === 'server'">
        <el-form-item :label="t('dialog.port')" prop="port">
          <el-input v-model.number="formData.port" placeholder="21" prefix="Key" type="number" />
        </el-form-item>
        <el-form-item :label="t('dialog.username')" prop="username">
          <el-input v-model="formData.username" :placeholder="t('dialog.usernamePlaceholder')" prefix="UserFilled" />
        </el-form-item>
        <el-form-item :label="t('dialog.password')" prop="password">
          <el-input v-model="formData.password" :placeholder="t('dialog.passwordPlaceholder')" type="password" />
        </el-form-item>
        <el-form-item :label="t('ftp.directory')" prop="ftpDirectory">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-input v-model="formData.ftpDirectory" :placeholder="t('ftp.selectDir')" style="flex: 1" />
            <el-button class="btn-primary" style="width: auto !important" @click="selectFtpDirectory">{{ t('ftp.browse') }}</el-button>
          </div>
        </el-form-item>
        <el-form-item :label="t('ftp.permission')">
          <el-checkbox-group v-model="formData.ftpPermissions">
            <el-checkbox label="get">Get</el-checkbox>
            <el-checkbox label="put">Put</el-checkbox>
            <el-checkbox label="delete">Delete</el-checkbox>
            <el-checkbox label="rename">Rename</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </template>
      <!-- FTP 客户端 / 其他协议 -->
      <template v-if="formData.connectionType !== 'ftp' || formData.ftpMode === 'client'">
        <el-form-item :label="t('dialog.serverAddress')" prop="host">
          <el-input v-model="formData.host" :placeholder="t('dialog.addressPlaceholder')" prefix="Monitor" />
        </el-form-item>
        <el-form-item :label="t('dialog.port')" prop="port" v-if="formData.connectionType !== 'ping'">
          <el-input
            v-model.number="formData.port"
            :placeholder="t('dialog.portPlaceholder')"
            prefix="Key"
            type="number"
          />
        </el-form-item>
        <el-form-item :label="t('dialog.username')" prop="username" v-if="!['ping', 'tftp', 'http', 'udp'].includes(formData.connectionType)">
          <el-input
            v-model="(formData as any).username"
            :placeholder="t('dialog.usernamePlaceholder')"
            prefix="UserFilled"
          />
        </el-form-item>
        <el-form-item :label="t('dialog.password')" prop="password" v-if="['ftp', 'tftp', 'http'].includes(formData.connectionType)">
          <el-input v-model="(formData as any).password" :placeholder="t('dialog.passwordPlaceholder')" type="password" />
        </el-form-item>
      </template>
    </el-form>
    <template #footer>
      <el-button class="btn-cancel" @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button class="btn-primary submit-btn" @click="handleSubmit">{{ t('dialog.confirmSave') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElForm } from 'element-plus'
import { createDefaultConnection, fromRawConnection } from '../entity/protocol'
import type { ConnectionFormData } from '../entity/protocol/base'

const { t } = useI18n()

const emit = defineEmits<{
  (e: 'submit', data: ConnectionFormData): void
}>()

const dialogVisible = ref(false)
const isSubmitting = ref(false)
const isEditMode = ref(false)
const formRef = ref<InstanceType<typeof ElForm> | null>(null)
const formData = reactive<ConnectionFormData>(createDefaultConnection('ftp'))
// 不设置 rules，避免切换 tab 时自动触发验证告警
// 验证逻辑在 handleSubmit 中手动处理
const formRules = ref({})

// 打开对话框（新建）
const open = (defaultType: string = 'ftp') => {
  isEditMode.value = false
  const defaults = createDefaultConnection(defaultType)
  // 先清除所有旧字段，防止 Object.assign 残留旧属性（如上次编辑的 id）
  Object.keys(formData).forEach((key) => delete (formData as any)[key])
  Object.assign(formData, defaults)
  if (formRef.value) {
    formRef.value.clearValidate()
  }
  dialogVisible.value = true
}

// 编辑模式下密码占位符（10个*），用于区分"有密码未修改"和"无密码"
const PASSWORD_PLACEHOLDER = '**********'

// 打开对话框（编辑）
const openEdit = (conn: any) => {
  isEditMode.value = true
  // 先清除旧字段
  Object.keys(formData).forEach((key) => delete (formData as any)[key])
  const normalized = fromRawConnection(conn)
  // 如果密码不为空（后端脱敏后返回 '***MASKED***'），固定显示10个 '*'
  if ((normalized as any).password && (normalized as any).password !== '') {
    ;(normalized as any).password = PASSWORD_PLACEHOLDER
  }
  Object.assign(formData, normalized)
  dialogVisible.value = true
}

// 协议切换处理
const handleProtocolChange = (value: string) => {
  // 清空密码（切换非FTP/TFTP时）
  if (value !== 'ftp' && value !== 'tftp') {
    (formData as any).password = ''
  }

  // 切换到 FTP 时设置默认模式
  if (value === 'ftp') {
    if ('ftpMode' in formData) {
      (formData as any).ftpMode = (formData as any).ftpMode || 'server'
      ;(formData as any).ftpDirectory = (formData as any).ftpDirectory || ''
      ;(formData as any).ftpPermissions = (formData as any).ftpPermissions?.length
        ? (formData as any).ftpPermissions
        : ['get', 'put', 'delete', 'rename']
    }
  }

  // 自动设置默认端口
  const portMap: Record<string, number> = {
    telnet: 23,
    ssh: 22,
    ftp: 21,
    tcp: 0,
    udp: 0,
    ping: 0,
    tftp: 69,
    http: 80
  }
  ;(formData as any).port = portMap[value] ?? 0
}

// FTP 目录选择
const selectFtpDirectory = async () => {
  try {
    const result = await window.dialogApi.openDirectoryDialog({
      title: t('ftp.selectFtpDir')
    })
    if (result.filePaths && result.filePaths.length > 0 && 'ftpDirectory' in formData) {
      ;(formData as any).ftpDirectory = result.filePaths[0]
    }
  } catch (error) {
    console.error('选择目录失败', error)
  }
}

// 获取需要验证的字段列表
const getRequiredFields = () => {
  const isFtpServer = formData.connectionType === 'ftp' && (formData as any).ftpMode === 'server'
  const needsServer = !isFtpServer && formData.connectionType !== 'ping'

  const fields: { prop: string; message: string }[] = [
    { prop: 'name', message: t('dialog.pleaseEnterName') }
  ]

  if (isFtpServer) {
    fields.push({ prop: 'port', message: t('dialog.pleaseEnterPort') })
    fields.push({ prop: 'ftpDirectory', message: t('dialog.pleaseSelectDir') })
  } else if (needsServer) {
    fields.push({ prop: 'host', message: t('dialog.pleaseEnterAddress') })
    if ((formData as any).connectionType !== 'ping') {
      fields.push({ prop: 'port', message: t('dialog.pleaseEnterPort') })
    }
    if (!['tcp', 'udp', 'ftp', 'telnet'].includes(formData.connectionType)) {
      fields.push({ prop: 'username', message: t('dialog.pleaseEnterUsername') })
    }
    if (['tftp', 'http'].includes(formData.connectionType)) {
      fields.push({ prop: 'password', message: t('dialog.pleaseEnterPassword') })
    }
  }

  return fields
}

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value || isSubmitting.value) return

  // 手动验证必填字段
  const requiredFields = getRequiredFields()
  for (const field of requiredFields) {
    const val = (formData as any)[field.prop]
    if (val === '' || val === undefined || val === null) {
      // 编辑模式下密码为空是可以的（表示不修改密码）
      if (isEditMode.value && field.prop === 'password') continue
      ElMessage.error(field.message)
      return
    }
  }

  // 验证通过，通知父组件保存
  // 深拷贝避免 reactive 代理对象导致 IPC 序列化失败（An object could not be cloned）
  isSubmitting.value = true
  const normalized = fromRawConnection(formData)
  // 编辑模式下如果密码是占位符（10个*），表示用户未修改密码
  if (isEditMode.value && (normalized as any).password === PASSWORD_PLACEHOLDER) {
    ;(normalized as any).password = '***MASKED***'
  }
  const submitData = JSON.parse(JSON.stringify(normalized))
  emit('submit', submitData as ConnectionFormData)
}

// 父组件调用：保存成功，关闭弹窗
const closeOnSuccess = () => {
  dialogVisible.value = false
  isSubmitting.value = false
  ElMessage.success(t('dialog.connectionSaved', { name: formData.name }))
}

// 父组件调用：保存失败
const onSaveError = (errorMessage: string) => {
  isSubmitting.value = false
  ElMessage.error(errorMessage)
}

defineExpose({ open, openEdit, closeOnSuccess, onSaveError })
</script>

<style scoped>
.el-dialog {
  background: var(--dialog-bg) !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: var(--dialog-text) !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: var(--text-primary) !important;
}

.el-input,
.el-select {
  --el-input-bg-color: var(--dialog-input-bg-override) !important;
  --el-input-text-color: var(--dialog-input-text-override) !important;
  --el-input-placeholder-color: var(--dialog-input-placeholder-override) !important;
  --el-border-color: var(--dialog-input-border-override) !important;
}

.el-input:focus-within,
.el-select:focus-within {
  --el-border-color: var(--focus-border-color) !important;
}

.submit-btn {
  width: 100px !important;
}

.protocol-tabs {
  margin-bottom: 16px;
}

.protocol-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
}

.protocol-tabs :deep(.el-tabs__nav-wrap::after) {
  background-color: var(--divider-color) !important;
}

.protocol-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--focus-border-color) !important;
}

.protocol-tabs :deep(.el-tabs__item) {
  color: var(--tabs-protocol-inactive) !important;
  font-size: 14px !important;
  font-weight: 500 !important;
}

.protocol-tabs :deep(.el-tabs__item:hover) {
  color: var(--dialog-text) !important;
}

.protocol-tabs :deep(.el-tabs__item.is-active) {
  color: var(--dialog-text) !important;
}

.protocol-tabs :deep(.el-tabs__item.is-disabled) {
  color: var(--tabs-protocol-disabled) !important;
  cursor: not-allowed !important;
}

.el-checkbox {
  color: var(--text-secondary) !important;
}

.el-checkbox__label {
  color: var(--text-secondary) !important;
}

</style>
