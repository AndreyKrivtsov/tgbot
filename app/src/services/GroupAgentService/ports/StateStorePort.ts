import type { BufferState, StoredChatHistory } from "../domain/Batch.js"

export interface StateStorePort {
  loadHistory: (chatId: number) => Promise<StoredChatHistory | null>
  saveHistory: (history: StoredChatHistory) => Promise<void>
  clearHistory: (chatId: number) => Promise<void>
  clearAllHistory: () => Promise<void>
  loadBuffers: () => Promise<BufferState[]>
  saveBuffers: (buffers: BufferState[]) => Promise<void>
  clearBuffer: (chatId: number) => Promise<void>
}
