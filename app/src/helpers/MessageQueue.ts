interface Message {
  id: number
  message: string
  contextId: string
}

export class MessageQueue {
  queue: Message[]

  constructor() {
    this.queue = []
  }

  length() {
    return this.queue.length
  }

  set(id: number, message: string, contextId: string) {
    this.queue.push({ id, message, contextId })
  }

  get() {
    if (this.length()) {
      const result = this.queue.shift()
      return result
    }

    return undefined
  }
}
