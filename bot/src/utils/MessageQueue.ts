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
    console.log("Set, length", this.length())
  }

  get() {
    if (this.length()) {
      const result = this.queue.shift()
      console.log("Get, length", this.length())
      return result
    }

    return undefined
  }
}
