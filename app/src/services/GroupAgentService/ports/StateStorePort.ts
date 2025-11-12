import type { BufferState, ChatHistory } from "../domain/types.js"

export interface StateStorePort {
  loadHistory(chatId: number): Promise<ChatHistory | null>
  saveHistory(history: ChatHistory): Promise<void>
  loadBuffers(): Promise<BufferState[]>
  saveBuffers(buffers: BufferState[]): Promise<void>
}


