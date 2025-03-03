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

    add(id: number, message: string, contextId: string) {
        this.queue.push({ id, message, contextId })
    }

    get() {
        return this.queue.shift()
    }
}