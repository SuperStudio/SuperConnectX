import { createApp } from 'vue'
import App from './App.vue'
import ElementPlus from 'element-plus' // 引入 Element Plus
import 'element-plus/dist/index.css' // 引入样式
import * as ElementPlusIconsVue from '@element-plus/icons-vue' // 引入图标

const app = createApp(App)

// 全局注册所有图标
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}

app.use(ElementPlus).mount('#app')
