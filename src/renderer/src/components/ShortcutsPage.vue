<template>
  <div class="shortcuts-page">
    <!-- 搜索框 -->
    <div class="shortcuts-search">
      <div class="search-inner">
        <input
          type="text"
          placeholder="搜索..."
          v-model="searchKeyword"
          class="search-input"
        />
        <button class="clear-btn" @click="clearSearch" v-if="searchKeyword">×</button>
      </div>
    </div>

    <!-- 快捷键表格 -->
    <div class="shortcuts-table">
      <el-table
        :data="filteredShortcuts"
        size="small"
        stripe
        style="width: 100%; height: 100%"
        :header-cell-style="{ background: '#2d2d2d', color: '#e0e0e0', fontWeight: '600' }"
        empty-text="暂无快捷键"
      >
        <el-table-column label="操作" min-width="200" prop="action">
          <template #default="{ row }">
            <span class="action-text">{{ row.action }}</span>
          </template>
        </el-table-column>
        <el-table-column label="快捷键" width="220" align="center">
          <template #default="{ row }">
            <div class="shortcut-keys">
              <span
                v-for="(key, index) in row.keys"
                :key="index"
                class="key-badge"
              >{{ key }}</span>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const searchKeyword = ref('')

// 快捷键列表数据
const shortcuts = ref([
  { action: '新建连接', keys: ['Ctrl', 'N'] },
  { action: '打开连接', keys: ['Ctrl', 'O'] },
  { action: '保存连接', keys: ['Ctrl', 'S'] },
  { action: '关闭当前标签', keys: ['Ctrl', 'W'] },
  { action: '刷新串口列表', keys: ['F5'] },
  { action: '连接串口', keys: ['Enter'] },
  { action: '断开连接', keys: ['Ctrl', 'D'] },
  { action: '发送命令', keys: ['Enter'] },
  { action: '清空终端', keys: ['Ctrl', 'L'] },
  { action: '搜索终端输出', keys: ['Ctrl', 'F'] },
  { action: '打开设置', keys: ['Ctrl', ','] },
  { action: '切换到上一个标签', keys: ['Ctrl', 'Tab'] },
  { action: '切换到下一个标签', keys: ['Ctrl', 'Shift', 'Tab'] },
  { action: '固定/取消固定标签', keys: ['Ctrl', 'P'] },
  { action: '全局焦点切换', keys: ['Ctrl', '`'] },
  { action: '复制选中内容', keys: ['Ctrl', 'C'] },
  { action: '粘贴到终端', keys: ['Ctrl', 'Shift', 'V'] },
  { action: '全选终端内容', keys: ['Ctrl', 'A'] },
  { action: '打开命令编辑器', keys: ['Ctrl', 'E'] },
  { action: '切换连接列表', keys: ['Ctrl', 'B'] },
])

// 过滤后的快捷键列表
const filteredShortcuts = computed(() => {
  if (!searchKeyword.value.trim()) {
    return shortcuts.value
  }
  const keyword = searchKeyword.value.toLowerCase()
  return shortcuts.value.filter(item =>
    item.action.toLowerCase().includes(keyword) ||
    item.keys.some(key => key.toLowerCase().includes(keyword))
  )
})

const clearSearch = () => {
  searchKeyword.value = ''
}
</script>

<style scoped>
.shortcuts-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 16px;
  background: #1e1e1e;
  gap: 12px;
}

.shortcuts-search {
  flex-shrink: 0;
  padding: 0;
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

.shortcuts-table {
  flex: 1;
  min-height: 0;
  padding-bottom: 32px;
}

.shortcuts-table :deep(.el-table) {
  background: #1e1e1e;
  color: #e0e0e0;
  border-radius: 4px;
  border: 1px solid #3a3a3a;
  --el-table-border: none !important;
  --el-table-border-color: transparent !important;
}

.shortcuts-table :deep(.el-table__header-wrapper th) {
  background: #2d2d2d !important;
  color: #e0e0e0;
  font-weight: 600;
  border-bottom: 1px solid #3a3a3a !important;
}

.shortcuts-table :deep(.el-table__body-wrapper) {
  background: #1e1e1e;
}

.shortcuts-table :deep(.el-table__body tr) {
  background: #1e1e1e;
}

.shortcuts-table :deep(.el-table__body tr:hover > td) {
  background: #094771 !important;
}

.shortcuts-table :deep(.el-table__body td) {
  background: #1e1e1e;
  border-bottom: 1px solid #2d2d2d !important;
}

.shortcuts-table :deep(.el-table__body .el-table__row--striped td) {
  background: #252526 !important;
}

.shortcuts-table :deep(.el-table__empty-text) {
  color: #888;
  padding: 40px 0;
}

.action-text {
  color: #e0e0e0;
}

.shortcut-keys {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex-wrap: wrap;
}

.key-badge {
  display: inline-block;
  padding: 2px 8px;
  background: #3a3a3a;
  color: #e0e0e0;
  font-size: 12px;
  font-family: 'Consolas', 'Monaco', monospace;
  border-radius: 4px;
  border: 1px solid #555;
  white-space: nowrap;
}

/* 滚动条美化 */
.shortcuts-table::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.shortcuts-table::-webkit-scrollbar-track {
  background: #1e1e1e;
}

.shortcuts-table::-webkit-scrollbar-thumb {
  background: #555;
  border-radius: 4px;
}

.shortcuts-table::-webkit-scrollbar-thumb:hover {
  background: #666;
}
</style>
