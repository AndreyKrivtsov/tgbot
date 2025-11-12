import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { EventBus } from "../../core/EventBus.js"
import { EVENTS } from "../../core/EventBus.js"
import { AI_MODERATION_CONFIG } from "../../constants.js"
import type { LLMPort } from "../ai/llm.models.js"
import { buildModerationPrompt } from "../ai/moderation.promptBuilder.js"
import { getModel, getSystemPrompt } from "../ai/moderation.policy.js"
import { decisionsToViolations } from "../ai/moderation.postprocess.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import type { RedisService } from "../RedisService/index.js"

interface BufferedMessage {
  id: number
  timestamp: number
  userId: number
  username?: string
  text: string
  name?: string
}

interface WarningRecord {
  username: string
  timestamp: number
  reason: string
  action: "warn" | "mute" | "ban" | "kick"
}

interface WarningHistoryForAI {
  username: string
  reason: string
}

interface ModerationViolation {
  messageId: number
  reason: string
  action: "warn" | "mute" | "kick" | "ban"
}

export class AIModerationService {
  private config: AppConfig
  private logger: Logger
  private eventBus?: EventBus
  private llm?: LLMPort
  private chatRepository?: ChatRepository
  private redisService?: RedisService

  private buffers = new Map<number, BufferedMessage[]>()
  private windowStartByChat = new Map<number, number>()
  private intervalId?: NodeJS.Timeout

  private static readonly WARNING_HISTORY_TTL_SEC = 3600 // 1 час

  constructor(
    config: AppConfig,
    logger: Logger,
    deps: {
      eventBus?: EventBus
      llm?: LLMPort
      chatRepository?: ChatRepository
      redisService?: RedisService
    } = {},
  ) {
    this.config = config
    this.logger = logger
    this.eventBus = deps.eventBus
    this.llm = deps.llm
    this.chatRepository = deps.chatRepository
    this.redisService = deps.redisService
  }

  private getWarningHistoryKey(chatId: number): string {
    return `moderation:warnings:${chatId}`
  }

  private async getWarningHistory(chatId: number): Promise<WarningHistoryForAI[]> {
    if (!this.redisService) {
      return []
    }

    const key = this.getWarningHistoryKey(chatId)
    const history = await this.redisService.get<WarningRecord[]>(key)

    if (!history) {
      return []
    }

    const now = Date.now()
    const oneHourAgo = now - 3600_000

    const filtered = history.filter(w => w.timestamp >= oneHourAgo)

    return filtered.map(w => ({
      username: w.username,
      reason: w.reason,
    }))
  }

  private async saveWarning(chatId: number, warning: WarningRecord): Promise<void> {
    if (!this.redisService) {
      return
    }

    const key = this.getWarningHistoryKey(chatId)
    const history = await this.redisService.get<WarningRecord[]>(key) || []

    history.push(warning)

    const now = Date.now()
    const oneHourAgo = now - 3600_000
    const filtered = history.filter(w => w.timestamp >= oneHourAgo)

    await this.redisService.set(key, filtered, AIModerationService.WARNING_HISTORY_TTL_SEC)
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
    // AIModerationService — последний обработчик
    this.eventBus.onMessageGroupOrdered(async (ctx: any) => {
      try {
        const { id, date, from, chat, text } = ctx
        if (!chat?.id || !from?.id || !text)
          return false

        const chatId = chat.id as number
        this.receiveMessage({
          id: id || ctx.messageId || Date.now(),
          timestamp: (date ? Number(date) * 1000 : Date.now()),
          userId: from.id,
          username: from.username,
          name: `${from.first_name || ""} ${from.last_name || ""}`.trim(),
          text: text as string,
        }, chatId)
        return true // поглощаем событие как последний обработчик
      } catch (e) {
        this.logger.e("AIModerationService buffer error:", e)
        return false
      }
    }, 10)
  }

  private receiveMessage(message: BufferedMessage, chatId: number): void {
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
  }

  private async flushAll(): Promise<void> {
    const entries = Array.from(this.buffers.entries())
    if (entries.length === 0)
      return

    for (const [chatId, messages] of entries) {
      if (!messages.length)
        continue

      // Очищаем буфер сразу, чтобы новые сообщения не терялись
      this.buffers.set(chatId, [])

      try {
        await this.moderateMessages(chatId, messages)
      } catch (error) {
        this.logger.e(`AIModerationService error for chat ${chatId}:`, error)
      } finally {
        this.windowStartByChat.set(chatId, Date.now())
      }
    }
  }

  private async moderateMessages(chatId: number, messages: BufferedMessage[]): Promise<void> {
    if (!this.llm || !this.chatRepository) {
      this.logger.w("AIModerationService: LLM or ChatSettingsService not available")
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

    // Получаем историю предупреждений для чата
    const warningHistory = await this.getWarningHistory(chatId)

    const prompt = buildModerationPrompt(
      messages.slice(0, AI_MODERATION_CONFIG.MAX_BATCH).map(m => ({ id: m.id, user: m.username || m.name || m.userId, text: m.text })),
      warningHistory,
    )

    try {
      const result = await this.llm.moderateBatch({
        chatId,
        prompt: `${getSystemPrompt()}\n\n${prompt}`,
        model: getModel(),
        apiKey,
      })

      const messageToUser = new Map<number, BufferedMessage>()
      for (const msg of messages) messageToUser.set(msg.id, msg)
      const violations = decisionsToViolations(result.decisions)
        .filter(v => messageToUser.has(v.messageId))

      // Сохраняем WARN в историю (для промпта следующей итерации)
      for (const v of violations) {
        if (v.action === "warn") {
          const m = messageToUser.get(v.messageId)!
          const username = m.username || m.name || `User${m.userId}`
          await this.saveWarning(chatId, { username, timestamp: Date.now(), reason: v.reason, action: "warn" })
        }
      }

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

        this.logger.i(`Found ${violations.length} violations in chat ${chatId}:`, violations)
      } else {
        this.logger.d(`No violations found in chat ${chatId}`)
      }
    } catch (error) {
      this.logger.e(`Failed to moderate messages for chat ${chatId}:`, error)
    }
  }

  private async parseViolations(_response: string, _messages: BufferedMessage[], _chatId: number): Promise<ModerationViolation[]> { return [] }
}
