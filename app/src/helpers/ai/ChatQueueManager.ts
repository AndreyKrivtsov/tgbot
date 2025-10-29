import { MessageQueue } from "./MessageQueue.js"
import type { MessageQueueItem } from "./MessageQueue.js"

export class ChatQueueManager {
  private queues: Map<string, MessageQueue> = new Map()

  enqueue(chatId: string, item: MessageQueueItem): void {
    if (!this.queues.has(chatId)) {
      this.queues.set(chatId, new MessageQueue())
    }
    this.queues.get(chatId)!.enqueue(item)
  }

  dequeue(chatId: string): MessageQueueItem | undefined {
    return this.queues.get(chatId)?.dequeue()
  }

  getQueue(chatId: string): MessageQueue | undefined {
    return this.queues.get(chatId)
  }

  clearQueue(chatId: string): void {
    this.queues.get(chatId)?.clear()
  }

  clearAll(): void {
    this.queues.clear()
  }

  getQueueLength(chatId: string): number {
    return this.queues.get(chatId)?.length ?? 0
  }

  hasQueue(chatId: string): boolean {
    return this.queues.has(chatId)
  }
}
