import type { BufferState } from "../domain/Batch.js"
import type { BufferedMessage } from "../domain/Message.js"

type ChatBuffer = Map<number, BufferedMessage>

export class MessageBuffer {
  private readonly buffers: Map<number, ChatBuffer>

  constructor(initialState: BufferState[] = []) {
    this.buffers = new Map()
    for (const state of initialState) {
      const chatBuffer: ChatBuffer = new Map()
      for (const message of state.messages) {
        chatBuffer.set(message.messageId, { ...message })
      }
      this.buffers.set(state.chatId, chatBuffer)
    }
  }

  addMessage(message: BufferedMessage): void {
    let chatBuffer = this.buffers.get(message.chatId)
    if (!chatBuffer) {
      chatBuffer = new Map()
      this.buffers.set(message.chatId, chatBuffer)
    }

    if (!chatBuffer.has(message.messageId)) {
      chatBuffer.set(message.messageId, { ...message })
    }
  }

  getPendingMessages(chatId: number): BufferedMessage[] {
    const chatBuffer = this.buffers.get(chatId)
    if (!chatBuffer) {
      return []
    }
    return Array.from(chatBuffer.values())
  }

  remove(chatId: number, messageIds: number[]): void {
    const chatBuffer = this.buffers.get(chatId)
    if (!chatBuffer) {
      return
    }
    for (const messageId of messageIds) {
      chatBuffer.delete(messageId)
    }
    if (chatBuffer.size === 0) {
      this.buffers.delete(chatId)
    }
  }

  clear(chatId: number): void {
    this.buffers.delete(chatId)
  }

  toState(): BufferState[] {
    return Array.from(this.buffers.entries()).map(([chatId, messages]) => ({
      chatId,
      messages: Array.from(messages.values()).map(message => ({ ...message })),
      updatedAt: Date.now(),
    }))
  }

  listChatIds(): number[] {
    return Array.from(this.buffers.keys())
  }
}
