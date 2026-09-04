import { ref, type Ref } from 'vue'

// 每个终端实例保存自己的纵向分割比例。终端通过 v-show 切换时实例不会销毁，
// 因此可以保留各自的高度；关闭标签后状态会随组件实例一起释放。
export function useTerminalPanelLayout(): {
  terminalOutputRatio: Ref<number | null>
} {
  return { terminalOutputRatio: ref<number | null>(null) }
}
