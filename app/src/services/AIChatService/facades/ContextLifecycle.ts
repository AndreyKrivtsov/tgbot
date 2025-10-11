import type { Logger } from "../../helpers/Logger.js"
import { ChatContextManager } from "../ChatContextManager.js"
import type { ChatContext } from "../ChatContextManager.js"

export class ContextLifecycle {
  private manager: ChatContextManager
  private logger: Logger

  constructor(manager: ChatContextManager, logger: Logger) {
    this.manager = manager
    this.logger = logger
  }

  async getOrCreateContext(contextId: string): Promise<ChatContext> {
    let context = this.manager.getContext(contextId)
    if (!context) {
      const cached = await this.manager.loadFromCache(contextId)
      if (cached) {
        context = cached
        this.manager.setContext(contextId, context)
      } else {
        context = this.manager.createContext(contextId)
      }
    }
    this.ensureShape(context)
    return context
  }

  ensureShape(context: ChatContext): void {
    if (!Array.isArray(context.messages)) {
      this.logger.e("context.messages is not an array! Восстанавливаю...")
      context.messages = []
    }
  }

  appendUserMessage(context: ChatContext, text: string): void {
    context.messages.push({ role: "user", content: text, timestamp: Date.now() })
  }

  appendModelMessage(context: ChatContext, text: string): void {
    context.messages.push({ role: "model", content: text, timestamp: Date.now() })
  }

  pruneByLimit(context: ChatContext, maxMessages: number): void {
    if (context.messages.length > maxMessages) {
      context.messages = context.messages.slice(-maxMessages)
    }
  }

  touch(context: ChatContext, incrementRequestCount: boolean = false): void {
    context.lastActivity = Date.now()
    if (incrementRequestCount) {
      context.requestCount++
    }
  }

  commit(contextId: string, context: ChatContext): void {
    this.manager.setContext(contextId, context)
  }
}


