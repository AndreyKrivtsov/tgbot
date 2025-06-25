export interface MessageQueueItem {
  id: number
  message: string
  contextId: string
  timestamp: number
  retryCount: number
  userMessageId?: number
}

export class MessageQueue {
  private queue: MessageQueueItem[] = []

  enqueue(item: MessageQueueItem): void {
    this.queue.push(item)
  }

  dequeue(): MessageQueueItem | undefined {
    return this.queue.shift()
  }

  filter(predicate: (item: MessageQueueItem) => boolean): void {
    this.queue = this.queue.filter(predicate)
  }

  get length(): number {
    return this.queue.length
  }

  clear(): void {
    this.queue = []
  }

  some(predicate: (item: MessageQueueItem) => boolean): boolean {
    return this.queue.some(predicate)
  }
}
