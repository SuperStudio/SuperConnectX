<!-- src/components/SearchInput.vue -->
<template>
  <div class="sidebar-search">
    <div class="search-inner">
      <input
        type="text"
        placeholder="搜索连接..."
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
const emit = defineEmits(['search'])
const searchText = ref('')

// 实时搜索
const handleSearch = () => emit('search', searchText.value.trim())
// 清空搜索
const clearSearch = () => {
  searchText.value = ''
  emit('search', '')
}
// 监听文本变化（容错）
watch(searchText, (val) => emit('search', val.trim()))
</script>

<style scoped>
.sidebar-search {
  padding: 10px 12px;
  border-bottom: 1px solid #e5e7eb;
  background: #fff;
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
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 13px;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s;
}

.search-input:focus {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
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
</style>
