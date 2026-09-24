<template>
  <el-dialog
    :model-value="visible"
    :title="$t('dialog.editRemark')"
    width="min(400px, calc(100vw - 32px))"
    :close-on-click-modal="false"
    @update:model-value="$emit('update:visible', $event)"
    @opened="$emit('opened')"
  >
    <el-form label-position="top" @submit.prevent>
      <el-form-item>
        <template #label>
          <span class="serial-port-name" :title="comName">{{ comName }}</span>
        </template>
        <el-input
          ref="remarkInputRef"
          :model-value="remark"
          :placeholder="$t('dialog.remarkPlaceholder')"
          maxlength="50"
          @update:model-value="$emit('update:remark', $event)"
          @keydown.enter="$emit('save')"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="$emit('update:visible', false)">{{ $t('common.cancel') }}</el-button>
      <el-button class="btn-primary" style="width: auto !important" @click="$emit('save')">{{ $t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'

defineProps<{
  visible: boolean
  comName: string
  remark: string
}>()

defineEmits<{
  'update:visible': [value: boolean]
  opened: []
  save: []
  'update:remark': [value: string]
}>()

const remarkInputRef = ref<any>(null)
defineExpose({ remarkInputRef })
</script>

<style scoped>
.serial-port-name {
  display: block;
  max-width: 100%;
  overflow-wrap: anywhere;
  line-height: 1.4;
}
</style>
