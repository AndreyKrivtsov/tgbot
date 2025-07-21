import type { RedisService } from "../RedisService/index.js"

export interface ChatContext {
  chatId: string
  messages: Array<{ role: "user" | "assistant" | "model", content: string, timestamp: number }>
  lastActivity: number
  requestCount: number
}

export class ChatContextManager {
  private contexts: Map<string, ChatContext> = new Map()
  private redis?: RedisService

  constructor(redis?: RedisService) {
    this.redis = redis
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
    if (!this.redis)
      return null

    const cached = await this.redis.get<ChatContext>(`ai:context:${chatId}`)
    if (cached) {
      if (typeof cached === "string") {
        try {
          const parsed = JSON.parse(cached)
          this.contexts.set(chatId, parsed)
          await this.redis.set(`ai:context:${chatId}`, parsed)
          console.log(`[ChatContextManager] Исправлен устаревший формат контекста для чата ${chatId}`)
          return parsed
        } catch (e) {
          console.error(`[ChatContextManager] Не удалось распарсить строку-контекст для чата ${chatId}, удаляю ключ`, e)
          await this.redis.del(`ai:context:${chatId}`)
          return null
        }
      }
      this.contexts.set(chatId, cached)
      return cached
    }
    return null
  }

  async saveToCache(chatId: string): Promise<void> {
    if (!this.redis)
      return

    const context = this.contexts.get(chatId)
    if (context) {
      await this.redis.set(`ai:context:${chatId}`, context)
    }
  }

  async saveAllToCache(): Promise<void> {
    if (!this.redis)
      return

    for (const [chatId, context] of this.contexts.entries()) {
      await this.redis.set(`ai:context:${chatId}`, context)
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

  createContext(chatId: string): ChatContext {
    const context: ChatContext = {
      chatId,
      messages: [],
      lastActivity: Date.now(),
      requestCount: 0,
    }
    this.setContext(chatId, context)
    return context
  }
}
