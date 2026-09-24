// 简单的事件总线实现
type EventHandler = (...args: any[]) => void

class EventBus {
  private events: Map<string, Set<EventHandler>> = new Map()

  on(event: string, handler: EventHandler): void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set())
    }
    this.events.get(event)!.add(handler)
  }

  off(event: string, handler: EventHandler): void {
    this.events.get(event)?.delete(handler)
  }

  emit(event: string, ...args: any[]): void {
    this.events.get(event)?.forEach(handler => handler(...args))
  }

  once(event: string, handler: EventHandler): void {
    const onceHandler: EventHandler = (...args) => {
      handler(...args)
      this.off(event, onceHandler)
    }
    this.on(event, onceHandler)
  }
}

// 创建并导出单例
const eventBus = new EventBus()

export default eventBus
