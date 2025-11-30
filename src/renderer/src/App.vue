<template>
  <div class="app-container">
    <!-- 顶部导航栏 -->
    <header class="app-header">
      <h1>🚀 SuperSSH</h1>
      <div class="header-actions">
        <button @click="createNewConnection">新建连接</button>
        <button @click="openSettings">设置</button>
      </div>
    </header>

    <!-- 主内容区：左侧连接列表 + 右侧终端 -->
    <main class="app-main">
      <div class="connection-list">
        <h3>已保存连接</h3>
        <div class="empty-state" v-if="connections.length === 0">
          暂无连接，点击「新建连接」添加
        </div>
        <ul v-else>
          <li v-for="conn in connections" :key="conn.id">
            {{ conn.name }} ({{ conn.host }})
            <button @click="connectToServer(conn)">连接</button>
          </li>
        </ul>
      </div>
      <div class="terminal-panel">
        <div class="terminal-placeholder">
          选择一个连接或新建连接以启动 SSH 终端
        </div>
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

// 模拟已保存的 SSH 连接
const connections = ref([
  { id: 1, name: '阿里云服务器', host: '120.XX.XX.XX', port: 22, username: 'root' },
  { id: 2, name: '本地测试机', host: '192.168.1.100', port: 22, username: 'ubuntu' }
]);

// 新建连接（后续可弹窗表单实现）
const createNewConnection = () => {
  alert('新建 SSH 连接（后续实现表单填写）');
};

// 打开设置
const openSettings = () => {
  alert('打开设置面板（后续实现）');
};

// 连接到服务器（后续通过 SSH 库实现）
const connectToServer = (conn: any) => {
  alert(`正在连接 ${conn.name} (${conn.host}:${conn.port})`);
};
</script>

<style scoped>
.app-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #1e1e1e;
  color: #fff;
}

.app-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 60px;
  border-bottom: 1px solid #333;
}

.header-actions button {
  margin-left: 10px;
  padding: 6px 12px;
  background: #42b983;
  border: none;
  border-radius: 4px;
  color: #fff;
  cursor: pointer;
}

.app-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.connection-list {
  width: 300px;
  border-right: 1px solid #333;
  padding: 20px;
  overflow-y: auto;
}

.empty-state {
  color: #888;
  margin-top: 20px;
}

.connection-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #333;
}

.connection-list button {
  background: #2c3e50;
  border: none;
  border-radius: 4px;
  color: #fff;
  padding: 4px 8px;
  cursor: pointer;
}

.terminal-panel {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #000;
  color: #aaa;
}
</style>