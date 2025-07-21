import type { CacheService } from "../CacheService/index.js"

export interface ChatContext {
  chatId: string
  messages: Array<{ role: "user" | "assistant" | "model", content: string, timestamp: number }>
  lastActivity: number
  requestCount: number
}

export class ChatContextManager {
  private contexts: Map<string, ChatContext> = new Map()
  private cacheService?: CacheService

  constructor(cacheService?: CacheService) {
    this.cacheService = cacheService
  }

  getContext(chatId: string): ChatContext | undefined {
    return this.contexts.get(chatId)
  }

  setContext(chatId: string, context: ChatContext): void {
    this.contexts.set(chatId, context)
  }

  clearContext(chatId: string): void {
    this.contexts.delete(chatId)
  }

  clearAll(): void {
    this.contexts.clear()
  }

  async loadFromCache(chatId: string): Promise<ChatContext | null> {
    if (!this.cacheService)
      return null

    const cached = await this.cacheService.get(`ai:context:${chatId}`)
    if (cached) {
      this.contexts.set(chatId, cached)
      return cached
    }
    return null
  }

  async saveToCache(chatId: string): Promise<void> {
    if (!this.cacheService)
      return

    const context = this.contexts.get(chatId)
    if (context) {
      this.cacheService.set(`ai:context:${chatId}`, context)
    }
  }

  async saveAllToCache(): Promise<void> {
    if (!this.cacheService)
      return

    for (const [chatId, context] of this.contexts.entries()) {
      this.cacheService.set(`ai:context:${chatId}`, context)
    }
  }

  clearOldContexts(timeoutMs: number): void {
    const now = Date.now()
    for (const [chatId, context] of this.contexts.entries()) {
      if (now - context.lastActivity > timeoutMs) {
        this.contexts.delete(chatId)
      }
    }
  }
}
