import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { EventBus } from "../../core/EventBus.js"
import { EVENTS } from "../../core/EventBus.js"
import { AI_MODERATION_CONFIG } from "../../constants.js"
import type { GeminiAdapter } from "../AIChatService/providers/GeminiAdapter.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"

interface BufferedMessage {
  id: number
  timestamp: number
  userId: number
  username?: string
  text: string
  name?: string
}

interface ModerationViolation {
  messageId: number
  reason: string
  action: "delete" | "warn" | "mute" | "kick" | "ban"
}

export class AIModerationService {
  private config: AppConfig
  private logger: Logger
  private eventBus?: EventBus
  private geminiAdapter?: GeminiAdapter
  private chatRepository?: ChatRepository

  private buffers = new Map<number, BufferedMessage[]>()
  private windowStartByChat = new Map<number, number>()
  private intervalId?: NodeJS.Timeout

  constructor(
    config: AppConfig,
    logger: Logger,
    deps: {
      eventBus?: EventBus
      geminiAdapter?: GeminiAdapter
      chatRepository?: ChatRepository
    } = {},
  ) {
    this.config = config
    this.logger = logger
    this.eventBus = deps.eventBus
    this.geminiAdapter = deps.geminiAdapter
    this.chatRepository = deps.chatRepository
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
    this.eventBus.on(EVENTS.MESSAGE_RECEIVED, async (ctx: any) => {
      try {
        const { id, date, from, chat, text } = ctx
        if (!chat?.id || !from?.id || !text)
          return

        const chatId = chat.id as number
        this.receiveMessage({
          id: id || ctx.messageId || Date.now(),
          timestamp: (date ? Number(date) * 1000 : Date.now()),
          userId: from.id,
          username: from.username,
          name: `${from.first_name || ""} ${from.last_name || ""}`.trim(),
          text: text as string,
        }, chatId)
      } catch (e) {
        this.logger.e("AIModerationService buffer error:", e)
      }
    })
  }

  private receiveMessage(message: BufferedMessage, chatId: number): void {
    console.log("receiveMessage", message, chatId)
    if (!this.windowStartByChat.has(chatId)) {
      this.windowStartByChat.set(chatId, Date.now())
    }

    // Обрезаем текст сообщения до максимальной длины
    const trimmedMessage: BufferedMessage = {
      ...message,
      text: message.text.length > AI_MODERATION_CONFIG.MAX_MESSAGE_LENGTH
        ? `${message.text.substring(0, AI_MODERATION_CONFIG.MAX_MESSAGE_LENGTH)}...`
        : message.text,
    }

    const buf = this.buffers.get(chatId) || []
    buf.push(trimmedMessage)

    // Обрезаем по лимиту
    if (buf.length > AI_MODERATION_CONFIG.MAX_BATCH) {
      buf.splice(0, buf.length - AI_MODERATION_CONFIG.MAX_BATCH)
    }

    this.buffers.set(chatId, buf)

    console.log("buffers", this.buffers)
  }

  private async flushAll(): Promise<void> {
    const entries = Array.from(this.buffers.entries())
    if (entries.length === 0)
      return

    for (const [chatId, messages] of entries) {
      if (!messages.length)
        continue

      try {
        await this.moderateMessages(chatId, messages)
      } catch (error) {
        this.logger.e(`AIModerationService error for chat ${chatId}:`, error)
      } finally {
        this.buffers.set(chatId, [])
        this.windowStartByChat.set(chatId, Date.now())
      }
    }
  }

  private async moderateMessages(chatId: number, messages: BufferedMessage[]): Promise<void> {
    if (!this.geminiAdapter || !this.chatRepository) {
      this.logger.w("AIModerationService: GeminiAdapter or ChatSettingsService not available")
      return
    }

    // Проверяем, включен ли AI для чата
    const config = await this.chatRepository.getChatConfig(chatId)
    const isAiEnabled = config?.aiEnabled ?? true
    if (!isAiEnabled) {
      this.logger.d(`AI moderation disabled for chat ${chatId}`)
      return
    }

    // Получаем API ключ для чата
    const apiKey = config?.geminiApiKey || null
    if (!apiKey) {
      this.logger.w(`No API key found for chat ${chatId}, skipping moderation`)
      return
    }

    // Подготавливаем промпт с сообщениями
    const messagesText = messages
      .slice(0, AI_MODERATION_CONFIG.MAX_BATCH)
      .map((msg, idx) => `[${idx + 1}] ID:${msg.id} User:${msg.username || msg.name || msg.userId} Text:"${msg.text}"`)
      .join("\n")

    const prompt = `Сообщения для проверки:
${messagesText}`

    try {
      const response = await this.geminiAdapter.generateContent(
        apiKey,
        prompt,
        [],
        AI_MODERATION_CONFIG.SYSTEM_PROMPT,
        {
          temperature: 0.3,
          maxOutputTokens: 2000,
        },
      )

      // Парсим ответ
      const violations = this.parseViolations(response, messages)

      console.log("violations", violations)

      if (violations.length > 0) {
        const windowStart = this.windowStartByChat.get(chatId) || (Date.now() - AI_MODERATION_CONFIG.INTERVAL_MS)
        const windowEnd = Date.now()

        this.eventBus?.emit(EVENTS.MODERATION_BATCH_RESULT, {
          chatId,
          windowStart,
          windowEnd,
          violations,
          messages,
        })

        this.logger.i(`Found ${violations.length} violations in chat ${chatId}`)
      }
    } catch (error) {
      this.logger.e(`Failed to moderate messages for chat ${chatId}:`, error)
    }
  }

  private parseViolations(response: string, messages: BufferedMessage[]): ModerationViolation[] {
    try {
      // Пытаемся найти JSON в ответе
      const jsonMatch = response.match(/\{[\s\S]*"violations"[\s\S]*\}/)
      if (!jsonMatch) {
        this.logger.w("No JSON found in moderation response")
        return []
      }

      const parsed = JSON.parse(jsonMatch[0])

      if (!Array.isArray(parsed.violations)) {
        this.logger.w("Invalid violations format in response")
        return []
      }

      // Валидируем каждое нарушение
      const validViolations: ModerationViolation[] = []
      for (const v of parsed.violations) {
        if (
          typeof v === "object"
          && typeof v.messageId === "number"
          && typeof v.reason === "string"
          && typeof v.action === "string"
          && ["delete", "warn", "mute", "kick", "ban"].includes(v.action)
        ) {
          // Проверяем, что messageId существует в наших сообщениях
          const messageExists = messages.some(m => m.id === v.messageId)
          if (messageExists) {
            validViolations.push({
              messageId: v.messageId,
              reason: v.reason,
              action: v.action as "delete" | "warn" | "mute" | "kick" | "ban",
            })
          }
        }
      }

      return validViolations
    } catch (error) {
      this.logger.e("Failed to parse moderation response:", error)
      return []
    }
  }
}
