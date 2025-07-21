/**
 * Простой EventBus для медиации событий между сервисами
 */
export class EventBus {
  private listeners: Map<string, ((data: any) => Promise<void>)[]> = new Map()

  /**
   * Подписка на событие
   */
  on(event: string, handler: (data: any) => Promise<void>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler)
  }

  /**
   * Отправка события
   */
  async emit(event: string, data: any): Promise<void> {
    const handlers = this.listeners.get(event) || []
    await Promise.all(handlers.map(handler => handler(data)))
  }
}
