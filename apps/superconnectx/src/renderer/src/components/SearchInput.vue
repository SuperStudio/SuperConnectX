<template>
  <div class="sidebar-search">
    <div class="search-inner">
      <input
        type="text"
        :placeholder="t('sidebar.searchPlaceholder')"
        v-model="searchText"
        @input="handleSearch"
        class="search-input"
      />
      <button class="clear-btn" @click="clearSearch" v-if="searchText">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const emit = defineEmits(['search'])
const searchText = ref('')

const handleSearch = () => emit('search', searchText.value.trim())

const clearSearch = () => {
  searchText.value = ''
  emit('search', '')
}

watch(searchText, (val) => emit('search', val.trim()))
</script>

<style scoped>
.sidebar-search {
  margin-top: 10px;
  padding: 0px;
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
  background-color: var(--search-input-bg);
  color: var(--search-input-color);
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
  color: var(--search-clear);
  font-size: 14px;
  cursor: pointer;
  padding: 0;
  line-height: 1;
}

.clear-btn:hover {
  color: var(--search-clear-hover);
}
</style>
