<template>
  <el-dialog
    :title="t('about.title')"
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
      <p class="about-version">{{ t('about.version', { version }) }}</p>
      <p class="about-desc">{{ t('about.description') }}</p>
      <div class="about-divider"></div>
      <p class="about-author">{{ t('about.author') }}</p>
      <p class="about-copyright">{{ t('about.copyright') }}</p>
      <div class="about-divider"></div>
      <p class="about-links">
        <a href="#" @click.prevent="openGithub">GitHub</a> |
        <a href="#" @click.prevent="openDoc">{{ t('about.doc') }}</a>
      </p>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

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
  color: var(--about-title-color);
  font-size: 20px;
  margin: 0 0 8px 0;
}

.about-version {
  color: var(--about-version-color);
  font-size: 14px;
  margin: 0 0 8px 0;
}

.about-desc {
  color: var(--about-desc-color);
  font-size: 13px;
  margin: 0 0 16px 0;
}

.about-divider {
  height: 1px;
  background: var(--about-divider-bg);
  margin: 16px 0;
}

.about-author,
.about-copyright {
  color: var(--about-desc-color);
  font-size: 12px;
  margin: 4px 0;
}

.about-links {
  color: var(--about-link-color);
  font-size: 13px;
  margin: 8px 0 0 0;
}

.about-links a {
  color: var(--about-link-color);
  text-decoration: none;
  margin: 0 8px;
}

.about-links a:hover {
  text-decoration: underline;
}
</style>
