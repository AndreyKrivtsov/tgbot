import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { EventBus } from "../../core/EventBus.js"
import { AI_MODERATION_CONFIG } from "../../constants.js"
import { axiosWithProxy } from "../../helpers/axiosWithProxy.js"

interface BufferedMessage {
  id: number
  timestamp: number
  userId: number
  username?: string
  text: string
}

interface BatchRequest {
  system: string
  chatId: number
  windowStart: number
  windowEnd: number
  messages: BufferedMessage[]
}

interface BatchResponse {
  violations: Array<{ messageId: number, reason: string, action: "delete" | "warn" | "mute" | "kick" | "ban" }>
}

export class AIModerationService {
  private config: AppConfig
  private logger: Logger
  private eventBus?: EventBus

  private buffers = new Map<number, BufferedMessage[]>()
  private windowStartByChat = new Map<number, number>()
  private intervalId?: NodeJS.Timeout

  constructor(config: AppConfig, logger: Logger, deps: { eventBus?: EventBus } = {}) {
    this.config = config
    this.logger = logger
    this.eventBus = deps.eventBus
  }

  async initialize(): Promise<void> {}

  async start(): Promise<void> {
    this.logger.i("🧠 Starting AI Moderation Service...")
    this.setupEventBus()
    this.intervalId = setInterval(() => this.flushAll(), AI_MODERATION_CONFIG.INTERVAL_MS)
    this.logger.i("✅ AI Moderation Service started")
  }

  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping AI Moderation Service...")
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = undefined
    }
    await this.flushAll()
    this.logger.i("✅ AI Moderation Service stopped")
  }

  isHealthy(): boolean {
    return true
  }

  private setupEventBus(): void {
    if (!this.eventBus)
      return
    this.eventBus.on("message.received", async (ctx: any) => {
      try {
        const { id, date, from, chat, text } = ctx
        if (!chat?.id || !from?.id || !text)
          return

        const chatId = chat.id as number
        if (!this.windowStartByChat.has(chatId)) {
          this.windowStartByChat.set(chatId, Date.now())
        }

        const buf = this.buffers.get(chatId) || []
        buf.push({
          id: id || ctx.messageId || Date.now(),
          timestamp: (date ? Number(date) * 1000 : Date.now()),
          userId: from.id,
          username: from.username,
          text: text as string,
        })
        // Обрезаем по лимиту
        if (buf.length > AI_MODERATION_CONFIG.MAX_BATCH) {
          buf.splice(0, buf.length - AI_MODERATION_CONFIG.MAX_BATCH)
        }
        this.buffers.set(chatId, buf)
      } catch (e) {
        this.logger.e("AIModerationService buffer error:", e)
      }
    })
  }

  private async flushAll(): Promise<void> {
    const entries = Array.from(this.buffers.entries())
    if (entries.length === 0)
      return

    for (const [chatId, messages] of entries) {
      if (!messages.length)
        continue

      const windowStart = this.windowStartByChat.get(chatId) || (Date.now() - AI_MODERATION_CONFIG.INTERVAL_MS)
      const windowEnd = Date.now()

      const requestBody: BatchRequest = {
        system: AI_MODERATION_CONFIG.SYSTEM_PROMPT,
        chatId,
        windowStart,
        windowEnd,
        messages: messages.slice(0, AI_MODERATION_CONFIG.MAX_BATCH),
      }

      try {
        const res = await axiosWithProxy<BatchResponse>({
          method: "POST",
          url: `${this.config.LLAMA_URL}/moderation/batch`,
          timeout: AI_MODERATION_CONFIG.REQUEST_TIMEOUT_MS,
          data: requestBody,
          headers: { "Content-Type": "application/json" },
        })

        const data = res.data
        if (this.isValidResponse(data)) {
          this.eventBus?.emit("moderation.batchResult", {
            chatId,
            windowStart,
            windowEnd,
            violations: data.violations,
            messages: requestBody.messages,
          })
        } else {
          this.logger.w("AIModerationService invalid response schema, ignoring")
        }
      } catch (error) {
        this.logger.e("AIModerationService request error:", error)
      } finally {
        this.buffers.set(chatId, [])
        this.windowStartByChat.set(chatId, Date.now())
      }
    }
  }

  private isValidResponse(resp: any): resp is BatchResponse {
    if (!resp || typeof resp !== "object")
      return false
    if (!Array.isArray(resp.violations))
      return false
    for (const v of resp.violations) {
      if (typeof v !== "object")
        return false
      if (typeof v.messageId !== "number")
        return false
      if (typeof v.reason !== "string")
        return false
      if (!("action" in v))
        return false
    }
    return true
  }
}
