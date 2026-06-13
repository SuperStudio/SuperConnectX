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
      <el-form-item label="模式" v-if="formData.connectionType === 'ftp'">
        <el-radio-group v-model="formData.ftpMode" class="mode-radio-group">
          <el-radio-button value="server">服务端</el-radio-button>
          <el-radio-button value="client">客户端</el-radio-button>
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
        <el-form-item label="目录" prop="ftpDirectory">
          <div style="display: flex; gap: 8px; width: 100%">
            <el-input v-model="formData.ftpDirectory" placeholder="选择共享目录" style="flex: 1" />
            <el-button class="btn-primary" style="width: auto !important" @click="selectFtpDirectory">浏览</el-button>
          </div>
        </el-form-item>
        <el-form-item label="权限">
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
            v-model="formData.username"
            :placeholder="t('dialog.usernamePlaceholder')"
            prefix="UserFilled"
          />
        </el-form-item>
        <el-form-item :label="t('dialog.password')" prop="password" v-if="['ftp', 'tftp', 'http'].includes(formData.connectionType)">
          <el-input v-model="formData.password" :placeholder="t('dialog.passwordPlaceholder')" type="password" />
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

// 打开对话框（编辑）
const openEdit = (conn: any) => {
  isEditMode.value = true
  // 先清除旧字段
  Object.keys(formData).forEach((key) => delete (formData as any)[key])
  Object.assign(formData, fromRawConnection(conn))
  dialogVisible.value = true
}

// 协议切换处理
const handleProtocolChange = (value: string) => {
  // 清空密码（切换非FTP/TFTP时）
  if (value !== 'ftp' && value !== 'tftp') {
    formData.password = ''
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
  formData.port = portMap[value] ?? 0
}

// FTP 目录选择
const selectFtpDirectory = async () => {
  try {
    const result = await window.dialogApi.openDirectoryDialog({
      title: '选择FTP共享目录'
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
    { prop: 'name', message: '请输入连接名称' }
  ]

  if (isFtpServer) {
    fields.push({ prop: 'port', message: '请输入端口' })
    fields.push({ prop: 'ftpDirectory', message: '请选择共享目录' })
  } else if (needsServer) {
    fields.push({ prop: 'host', message: '请输入服务器地址' })
    if (formData.connectionType !== 'ping') {
      fields.push({ prop: 'port', message: '请输入端口' })
    }
    if (!['tcp', 'udp', 'ftp'].includes(formData.connectionType)) {
      fields.push({ prop: 'username', message: '请输入用户名' })
    }
    if (['tftp', 'http'].includes(formData.connectionType)) {
      fields.push({ prop: 'password', message: '请输入密码' })
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
      ElMessage.error(field.message)
      return
    }
  }

  // 验证通过，通知父组件保存
  // 深拷贝避免 reactive 代理对象导致 IPC 序列化失败（An object could not be cloned）
  isSubmitting.value = true
  const submitData = JSON.parse(JSON.stringify(fromRawConnection(formData)))
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
  background: #252526 !important;
  border-radius: 8px !important;
}

.el-dialog__title {
  color: #f0f0f0 !important;
  font-size: 18px !important;
}

.el-form-item__label {
  color: #e8e8e8 !important;
}

.el-input,
.el-select {
  --el-input-bg-color: #cccccc !important;
  --el-input-text-color: #000 !important;
  --el-input-placeholder-color: #888 !important;
  --el-border-color: #444 !important;
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
  background-color: #3c3c3c !important;
}

.protocol-tabs :deep(.el-tabs__active-bar) {
  background-color: var(--focus-border-color) !important;
}

.protocol-tabs :deep(.el-tabs__item) {
  color: #a0a0a0 !important;
  font-size: 14px !important;
  font-weight: 500 !important;
}

.protocol-tabs :deep(.el-tabs__item:hover) {
  color: #f0f0f0 !important;
}

.protocol-tabs :deep(.el-tabs__item.is-active) {
  color: #f0f0f0 !important;
}

.protocol-tabs :deep(.el-tabs__item.is-disabled) {
  color: #5a5a5a !important;
  cursor: not-allowed !important;
}

.el-checkbox {
  color: #e0e0e0 !important;
}

.el-checkbox__label {
  color: #e0e0e0 !important;
}

</style>
