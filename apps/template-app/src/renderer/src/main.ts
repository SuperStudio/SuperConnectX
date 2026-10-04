import { createApp } from 'vue'
import App from './App.vue'
// 基础层主题令牌（dark/light 全套），先于应用样式加载
import '@superx/foundation/theme/themes.css'
import './assets/main.css'

createApp(App).mount('#app')
