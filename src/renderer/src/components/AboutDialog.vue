<template>
  <el-dialog
    title="关于 SuperConnectX"
    v-model="dialogVisible"
    width="400px"
    class="about-dialog"
    :close-on-click-modal="true"
  >
    <div class="about-content">
      <div class="about-logo">
        <img src="../assets/icon.png" alt="SuperConnectX" />
      </div>
      <h2 class="about-title">SuperConnectX</h2>
      <p class="about-version">版本 {{ version }}</p>
      <p class="about-desc">超级连接 - 多协议终端连接工具</p>
      <div class="about-divider"></div>
      <p class="about-author">作者：SuperStudio</p>
      <p class="about-copyright">版权所有 Copyright © 2025 SuperStudio</p>
      <div class="about-divider"></div>
      <p class="about-links">
        <a href="#" @click.prevent="openGithub">GitHub</a> |
        <a href="#" @click.prevent="openDoc">文档</a>
      </p>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const dialogVisible = defineModel<boolean>()

const version = ref('')

const loadVersion = async () => {
  try {
    version.value = await window.windowApi.getAppVersion()
  } catch (error) {
    version.value = '1.0.0'
  }
}

loadVersion()

const openGithub = () => {
  window.toolApi.openExternalUrl('https://github.com/SuperStudio/SuperConnectX')
}

const openDoc = () => {
  window.toolApi.openExternalUrl('https://github.com/SuperStudio/SuperConnectX#readme')
}
</script>

<style scoped>
.about-dialog :deep(.el-dialog__body) {
  text-align: center;
  padding: 20px;
}

.about-content {
  text-align: center;
}

.about-logo {
  width: 80px;
  height: 80px;
  margin: 0 auto 16px;
}

.about-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.about-title {
  color: #fff;
  font-size: 20px;
  margin: 0 0 8px 0;
}

.about-version {
  color: #aaa;
  font-size: 14px;
  margin: 0 0 8px 0;
}

.about-desc {
  color: #888;
  font-size: 13px;
  margin: 0 0 16px 0;
}

.about-divider {
  height: 1px;
  background: #3a3a3a;
  margin: 16px 0;
}

.about-author,
.about-copyright {
  color: #888;
  font-size: 12px;
  margin: 4px 0;
}

.about-links {
  color: #409eff;
  font-size: 13px;
  margin: 8px 0 0 0;
}

.about-links a {
  color: #409eff;
  text-decoration: none;
  margin: 0 8px;
}

.about-links a:hover {
  text-decoration: underline;
}
</style>
