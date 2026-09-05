<template>
  <el-dialog :title="isEditMode ? t('dialog.editConnection') : t('dialog.newConnection')" v-model="dialogVisible" width="640px" @keydown.enter.native="handleSubmit" :close-on-click-modal="false">
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
      <el-form-item :label="t('dialog.connectionName')" prop="name"><el-input v-model="formData.name" :placeholder="t('dialog.namePlaceholder')" prefix="User" /></el-form-item>
      <el-form-item :label="t('ftp.mode')" v-if="formData.connectionType === 'ftp'"><el-radio-group v-model="formData.ftpMode" class="mode-radio-group"><el-radio-button value="server">{{ t('ftp.server') }}</el-radio-button><el-radio-button value="client">{{ t('ftp.client') }}</el-radio-button></el-radio-group></el-form-item>
      <template v-if="formData.connectionType === 'ftp' && formData.ftpMode === 'server'">
        <el-form-item :label="t('dialog.port')" prop="port"><el-input v-model.number="formData.port" placeholder="21" prefix="Key" type="number" /></el-form-item>
        <el-form-item :label="t('dialog.username')" prop="username"><el-input v-model="formData.username" :placeholder="t('dialog.usernamePlaceholder')" prefix="UserFilled" /></el-form-item>
        <el-form-item :label="t('dialog.password')" prop="password"><el-input v-model="formData.password" :placeholder="t('dialog.passwordPlaceholder')" type="password" /></el-form-item>
        <el-form-item :label="t('ftp.directory')" prop="ftpDirectory"><div style="display: flex; gap: 8px; width: 100%"><el-input v-model="formData.ftpDirectory" :placeholder="t('ftp.selectDir')" style="flex: 1" /><el-button class="btn-primary" style="width: auto !important" @click="selectFtpDirectory">{{ t('ftp.browse') }}</el-button></div></el-form-item>
        <el-form-item :label="t('ftp.permission')"><el-checkbox-group v-model="formData.ftpPermissions"><el-checkbox label="get">Get</el-checkbox><el-checkbox label="put">Put</el-checkbox><el-checkbox label="delete">Delete</el-checkbox><el-checkbox label="rename">Rename</el-checkbox></el-checkbox-group></el-form-item>
      </template>
      <template v-if="formData.connectionType !== 'ftp' || formData.ftpMode === 'client'">
        <el-form-item :label="t('dialog.serverAddress')" prop="host"><el-input v-model="formData.host" :placeholder="t('dialog.addressPlaceholder')" prefix="Monitor" /></el-form-item>
        <el-form-item :label="t('dialog.port')" prop="port" v-if="formData.connectionType !== 'ping'"><el-input v-model.number="formData.port" :placeholder="t('dialog.portPlaceholder')" prefix="Key" type="number" /></el-form-item>
        <el-form-item :label="t('dialog.username')" prop="username" v-if="!['ping', 'tftp', 'http', 'udp'].includes(formData.connectionType)"><el-input v-model="(formData as any).username" :placeholder="t('dialog.usernamePlaceholder')" prefix="UserFilled" /></el-form-item>
        <el-form-item :label="t('dialog.password')" prop="password" v-if="['ftp', 'tftp', 'http'].includes(formData.connectionType)"><el-input v-model="(formData as any).password" :placeholder="t('dialog.passwordPlaceholder')" type="password" /></el-form-item>
        <el-form-item :label="t('comTerminal.encoding')" v-if="formData.connectionType === 'telnet'"><el-select v-model="formData.encoding" style="width: 100%"><el-option label="UTF-8" value="utf8" /><el-option label="GB2312" value="gb2312" /><el-option label="GBK" value="gbk" /><el-option label="GB18030" value="gb18030" /><el-option label="BIG5" value="big5" /><el-option label="Shift-JIS" value="shift-jis" /><el-option label="EUC-KR" value="euc-kr" /><el-option label="ASCII" value="ascii" /><el-option label="ISO-8859-1" value="latin1" /><el-option label="ISO-8859-2" value="latin2" /><el-option label="KOI8-R" value="koi8-r" /><el-option label="windows-1251" value="windows-1251" /><el-option label="windows-1252" value="windows-1252" /><el-option label="ISO-8859-5" value="iso-8859-5" /><el-option label="UTF-16LE" value="utf16le" /><el-option label="UTF-16BE" value="utf16be" /></el-select></el-form-item>
      </template>
    </el-form>
    <template #footer><el-button class="btn-cancel" @click="dialogVisible = false">{{ t('common.cancel') }}</el-button><el-button class="btn-primary submit-btn" @click="handleSubmit">{{ t('dialog.confirmSave') }}</el-button></template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage, ElForm } from 'element-plus'
import { createDefaultConnection, fromRawConnection } from '../../entity/protocol'
import type { ConnectionFormData } from '../../entity/protocol/base'

const { t } = useI18n()
const emit = defineEmits<{ (e: 'submit', data: ConnectionFormData): void }>()
const dialogVisible = ref(false)
const isSubmitting = ref(false)
const isEditMode = ref(false)
const formRef = ref<InstanceType<typeof ElForm> | null>(null)
const formData = reactive<ConnectionFormData>(createDefaultConnection('ftp'))
const formRules = ref({})
const PASSWORD_PLACEHOLDER = '**********'

const open = (defaultType: string = 'ftp') => {
  isEditMode.value = false
  Object.keys(formData).forEach((key) => delete (formData as any)[key])
  Object.assign(formData, createDefaultConnection(defaultType))
  formRef.value?.clearValidate()
  dialogVisible.value = true
}
const openEdit = (conn: any) => {
  isEditMode.value = true
  Object.keys(formData).forEach((key) => delete (formData as any)[key])
  const normalized = fromRawConnection(conn)
  if ((normalized as any).password) (normalized as any).password = PASSWORD_PLACEHOLDER
  Object.assign(formData, normalized)
  dialogVisible.value = true
}
const handleProtocolChange = (value: string) => {
  if (value !== 'ftp' && value !== 'tftp') (formData as any).password = ''
  if (value === 'ftp' && 'ftpMode' in formData) {
    ;(formData as any).ftpMode ||= 'server'
    ;(formData as any).ftpDirectory ||= ''
    if (!(formData as any).ftpPermissions?.length) (formData as any).ftpPermissions = ['get', 'put', 'delete', 'rename']
  }
  ;(formData as any).port = ({ telnet: 23, ssh: 22, ftp: 21, tcp: 0, udp: 0, ping: 0, tftp: 69, http: 80 } as Record<string, number>)[value] ?? 0
}
const selectFtpDirectory = async () => {
  try {
    const result = await window.dialogApi.openDirectoryDialog({ title: t('ftp.selectFtpDir') })
    if (result.filePaths?.length && 'ftpDirectory' in formData) (formData as any).ftpDirectory = result.filePaths[0]
  } catch (error) { console.error('选择目录失败', error) }
}
const getRequiredFields = () => {
  const isFtpServer = formData.connectionType === 'ftp' && (formData as any).ftpMode === 'server'
  const fields = [{ prop: 'name', message: t('dialog.pleaseEnterName') }]
  if (isFtpServer) return [...fields, { prop: 'port', message: t('dialog.pleaseEnterPort') }, { prop: 'ftpDirectory', message: t('dialog.pleaseSelectDir') }]
  if (formData.connectionType === 'ping') return fields
  fields.push({ prop: 'host', message: t('dialog.pleaseEnterAddress') })
  fields.push({ prop: 'port', message: t('dialog.pleaseEnterPort') })
  if (!['tcp', 'udp', 'ftp', 'telnet'].includes(formData.connectionType)) fields.push({ prop: 'username', message: t('dialog.pleaseEnterUsername') })
  if (['tftp', 'http'].includes(formData.connectionType)) fields.push({ prop: 'password', message: t('dialog.pleaseEnterPassword') })
  return fields
}
const handleSubmit = async () => {
  if (!formRef.value || isSubmitting.value) return
  for (const field of getRequiredFields()) {
    if ((formData as any)[field.prop] === '' || (formData as any)[field.prop] === undefined || (formData as any)[field.prop] === null) {
      if (isEditMode.value && field.prop === 'password') continue
      ElMessage.error(field.message)
      return
    }
  }
  isSubmitting.value = true
  const normalized = fromRawConnection(formData)
  if (isEditMode.value && (normalized as any).password === PASSWORD_PLACEHOLDER) (normalized as any).password = '***MASKED***'
  emit('submit', JSON.parse(JSON.stringify(normalized)) as ConnectionFormData)
}
const closeOnSuccess = () => { dialogVisible.value = false; isSubmitting.value = false; ElMessage.success(t('dialog.connectionSaved', { name: formData.name })) }
const onSaveError = (message: string) => { isSubmitting.value = false; ElMessage.error(message) }
defineExpose({ open, openEdit, closeOnSuccess, onSaveError })
</script>

<style scoped>
.el-dialog { background: var(--dialog-bg) !important; border-radius: 8px !important; }
.el-dialog__title { color: var(--dialog-text) !important; font-size: 18px !important; }
.el-form-item__label { color: var(--text-primary) !important; }
.el-input, .el-select { --el-input-bg-color: var(--dialog-input-bg-override) !important; --el-input-text-color: var(--dialog-input-text-override) !important; --el-input-placeholder-color: var(--dialog-input-placeholder-override) !important; --el-border-color: var(--dialog-input-border-override) !important; }
.el-input:focus-within, .el-select:focus-within { --el-border-color: var(--focus-border-color) !important; }
.submit-btn { width: 100px !important; }
.protocol-tabs { margin-bottom: 16px; }
.protocol-tabs :deep(.el-tabs__header) { margin-bottom: 0; }
.protocol-tabs :deep(.el-tabs__nav-wrap::after) { background-color: var(--divider-color) !important; }
.protocol-tabs :deep(.el-tabs__active-bar) { background-color: var(--focus-border-color) !important; }
.protocol-tabs :deep(.el-tabs__item) { color: var(--tabs-protocol-inactive) !important; font-size: 14px !important; font-weight: 500 !important; }
.protocol-tabs :deep(.el-tabs__item:hover), .protocol-tabs :deep(.el-tabs__item.is-active) { color: var(--dialog-text) !important; }
.protocol-tabs :deep(.el-tabs__item.is-disabled) { color: var(--tabs-protocol-disabled) !important; cursor: not-allowed !important; }
.el-checkbox, .el-checkbox__label { color: var(--text-secondary) !important; }
</style>
