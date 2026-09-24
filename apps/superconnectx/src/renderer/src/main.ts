import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import { i18n } from './locales'
import { messageConfig } from 'element-plus/es/components/config-provider/src/config-provider'

// 全局设置 ElMessage 默认显示时长 1.5 秒（默认 3 秒太久了）
messageConfig.duration = 1000

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus, { locale: zhCn }).use(i18n).mount('#app')
