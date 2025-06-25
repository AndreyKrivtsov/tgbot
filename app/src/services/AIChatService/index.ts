import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { GeminiMessage } from "./providers/GeminiAdapter.js"
import { GeminiAdapter } from "./providers/GeminiAdapter.js"
import { ChatRepository } from "../../repository/ChatRepository.js"
import type { Chat, ChatConfig, SystemPromptData } from "../../db/schema.js"
import type { DatabaseService } from "../DatabaseService/index.js"
import type { RedisService } from "../RedisService/index.js"
import { AI_CHAT_CONFIG } from "../../constants.js"
import { getMessage } from "../TelegramBot/utils/Messages.js"
import type { AdaptiveChatThrottleManager } from "./AdaptiveThrottleManager.js"
import { MessageQueue } from "./MessageQueue.js"
import type { MessageQueueItem } from "./MessageQueue.js"
import type { IAIProvider } from "./providers/IAIProvider.js"
import type { ChatQueueManager } from "./ChatQueueManager.js"
import type { ChatContext, ChatContextManager } from "./ChatContextManager.js"

interface AIChatDependencies {
  database?: DatabaseService
  redis?: RedisService
}

/**
 * Сервис AI чат-бота для общения с пользователями через Gemini
 */
export class AIChatService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: AIChatDependencies
  private chatContexts: Map<string, ChatContext> = new Map()
  private messageQueues: Map<string, MessageQueue> = new Map()
  private queueProcessors: Set<string> = new Set()
  private isProcessingQueue = false
  private nextMessageId = 1
  private chatRepository?: ChatRepository
  private redisService?: RedisService
  private chatSettings: Map<number, { chat: Chat | null, config: ChatConfig | null }> = new Map() // Кэш настроек чатов
  private activeTypingChats: Set<string> = new Set() // Чаты где активен typing
  private throttleManager: AdaptiveChatThrottleManager // Адаптивный throttling менеджер
  private contextSaveTimer?: NodeJS.Timeout // Таймер автосохранения контекстов
  private aiProvider: IAIProvider
  private queueManager: ChatQueueManager
  private contextManager: ChatContextManager

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: AIChatDependencies = {},
    aiProvider: IAIProvider,
    queueManager: ChatQueueManager,
    contextManager: ChatContextManager,
    throttleManager: AdaptiveChatThrottleManager,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
    this.throttleManager = throttleManager
    this.aiProvider = aiProvider
    this.queueManager = queueManager
    this.contextManager = contextManager

    if (dependencies.database) {
      this.chatRepository = new ChatRepository(dependencies.database)
    }

    if (dependencies.redis) {
      this.redisService = dependencies.redis
    }
  }

  /**
   * Инициализация сервиса AI чата
   */
  async initialize(): Promise<void> {
    this.logger.i("🤖 Initializing AI chat service...")

    // Загружаем настройки чатов из БД
    await this.loadChatSettings()

    this.logger.i("✅ AI chat service initialized")
  }

  /**
   * Запуск сервиса AI чата
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting AI chat service...")

    // Запускаем автосохранение контекстов
    this.startContextAutoSave()

    this.logger.i("✅ AI chat service started")
  }

  /**
   * Остановка сервиса AI чата
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping AI chat service...")
    this.isProcessingQueue = false

    // Останавливаем автосохранение
    if (this.contextSaveTimer) {
      clearInterval(this.contextSaveTimer)
      this.contextSaveTimer = undefined
    }

    // Сохраняем все контексты в кэш
    await this.saveAllContextsToCache()

    // Очищаем все очереди
    this.messageQueues.forEach(q => q.clear())
    this.messageQueues.clear()
    this.queueProcessors.clear()

    this.logger.i("✅ AI chat service stopped")
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing AI chat service...")
    await this.stop()
    this.throttleManager.dispose()
    this.chatContexts.clear()
    this.logger.i("✅ AI chat service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.dependencies.redis !== undefined
  }

  /**
   * Проверка, является ли сообщение обращением к боту
   */
  isBotMention(message: string, botUsername?: string, replyToBotMessage?: boolean): boolean {
    if (!message || message.trim().length === 0) {
      return false
    }

    // Если это ответ на сообщение бота, то это обращение к боту
    if (replyToBotMessage) {
      return true
    }

    const text = message.toLowerCase().trim()

    // Прямое упоминание через @username
    if (botUsername && text.includes(`@${botUsername.toLowerCase()}`)) {
      return true
    }

    // Обращение "эй бот", "альтрон" и т.д.
    const botTriggers = [
      /^эй.{0,3}бот\W?/i,
      /^альтрон/gi,
      /^бот[,\s]/i,
    ]

    for (const trigger of botTriggers) {
      if (trigger.test(text)) {
        return true
      }
    }

    return false
  }

  /**
   * Очистка сообщения от упоминаний бота
   */
  cleanBotMention(message: string, botUsername?: string): string {
    let cleaned = message.trim()

    // Убираем @username
    if (botUsername) {
      cleaned = cleaned.replace(new RegExp(`@${botUsername}`, "gi"), "").trim()
    }

    // Убираем стандартные обращения
    cleaned = cleaned.replace(/^эй.{0,3}бот\W?/i, "").trim()
    cleaned = cleaned.replace(/^альтрон\W?/gi, "").trim()
    cleaned = cleaned.replace(/^бот[,\s]/i, "").trim()

    return cleaned || message
  }

  /**
   * Обработка сообщения для AI
   */
  async processMessage(
    userId: number,
    chatId: number,
    message: string,
    username?: string,
    firstName?: string,
    userMessageId?: number,
  ): Promise<{
      success: boolean
      queued: boolean
      reason?: string
      queuePosition?: number
    }> {
    try {
      // Проверяем, включен ли ИИ для этого чата
      const aiEnabled = await this.isAiEnabledForChat(chatId)

      if (!aiEnabled) {
        this.logger.d(`AI disabled for chat ${chatId}, ignoring message from ${firstName} (${userId})`)
        return {
          success: false,
          queued: false,
          reason: "ИИ отключен для этого чата",
        }
      }

      // Проверяем размер очереди
      if (this.messageQueues.size >= AI_CHAT_CONFIG.MAX_QUEUE_SIZE) {
        return {
          success: false,
          queued: false,
          reason: "Слишком много сообщений в очереди. Попробуйте позже.",
        }
      }

      // Подготавливаем сообщение для AI
      const cleanedMessage = this.cleanBotMention(message)
      const contextualMessage = this.prepareContextualMessage(
        cleanedMessage,
        username,
        firstName,
      )

      // Добавляем в очередь
      const queueItem: MessageQueueItem = {
        id: this.nextMessageId++,
        message: contextualMessage,
        contextId: chatId.toString(),
        timestamp: Date.now(),
        retryCount: 0,
        userMessageId,
      }

      // Получаем очередь для contextId
      let queue = this.messageQueues.get(queueItem.contextId)
      if (!queue) {
        queue = new MessageQueue()
        this.messageQueues.set(queueItem.contextId, queue)
      }
      queue.enqueue(queueItem)

      // Включаем typing для этого чата если еще не включен
      if (!this.activeTypingChats.has(queueItem.contextId)) {
        this.activeTypingChats.add(queueItem.contextId)
        this.onTypingStart?.(queueItem.contextId)
      }

      // Запускаем процессор очереди для этого чата, если не запущен
      if (!this.queueProcessors.has(queueItem.contextId)) {
        this.startQueueProcessor(queueItem.contextId)
      }

      this.logger.d(`Added message to queue from ${firstName} (${userId})`)

      return {
        success: true,
        queued: true,
        queuePosition: queue.length,
      }
    } catch (error) {
      this.logger.e("Error processing message:", error)
      return {
        success: false,
        queued: false,
        reason: getMessage("ai_processing_error"),
      }
    }
  }

  /**
   * Подготовка контекстного сообщения
   */
  private prepareContextualMessage(
    message: string,
    username?: string,
    firstName?: string,
  ): string {
    const date = new Date()
    const messageDate = date.toISOString().replace(/:\d+\.\d+Z/gi, "").replace("T", " ")

    const userInfo = firstName
      ? (username ? `@${username}][${firstName}` : `${firstName}`)
      : (username ? `@${username}` : "пользователь")

    return `[${messageDate}][${userInfo}] пользователь спрашивает тебя: ${message}`
  }

  /**
   * Получение или создание контекста чата
   */
  private async getOrCreateContext(contextId: string): Promise<ChatContext> {
    let context = this.chatContexts.get(contextId)

    if (!context) {
      // Пытаемся загрузить из кэша
      const cachedContext = await this.loadContextFromCache(contextId)

      if (cachedContext) {
        // Восстанавливаем из кэша
        context = cachedContext
        this.chatContexts.set(contextId, context)
      } else {
        // Создаем новый контекст
        const now = Date.now()
        context = {
          chatId: contextId,
          messages: [],
          lastActivity: now,
          requestCount: 0,
        }
        this.chatContexts.set(contextId, context)
      }
    }

    context.lastActivity = Date.now()
    return context
  }

  /**
   * Запуск обработчика очереди сообщений
   */
  private startQueueProcessor(contextId: string): void {
    if (this.queueProcessors.has(contextId))
      return
    this.queueProcessors.add(contextId)
    const processNext = async () => {
      const queue = this.messageQueues.get(contextId)
      if (!queue || queue.length === 0) {
        this.queueProcessors.delete(contextId)
        return
      }
      try {
        const queueItem = queue.dequeue()
        if (queueItem) {
          await this.processQueuedMessage(queueItem)
        }
      } catch (error) {
        this.logger.e("Queue processing error:", error)
      }
      setTimeout(processNext, AI_CHAT_CONFIG.QUEUE_PROCESS_INTERVAL_MS)
    }
    processNext()
  }

  /**
   * Запуск автосохранения контекстов
   */
  private startContextAutoSave(): void {
    if (!this.redisService) {
      this.logger.d("No Redis connection, skipping context auto-save")
      return
    }

    this.contextSaveTimer = setInterval(async () => {
      try {
        await this.saveAllContextsToCache()
      } catch (error) {
        this.logger.e("Error in context auto-save:", error)
      }
    }, AI_CHAT_CONFIG.CONTEXT_SAVE_INTERVAL_MS)

    this.logger.d("Context auto-save started")
  }

  /**
   * Обработка сообщения из очереди
   */
  private async processQueuedMessage(queueItem: MessageQueueItem): Promise<void> {
    try {
      const context = await this.getOrCreateContext(queueItem.contextId)

      // Получаем API ключ и системный промпт для чата
      const apiKeyResult = await this.getApiKeyForChat(Number(queueItem.contextId))
      this.logger.d(`[AIChatService] processQueuedMessage: chatId=${queueItem.contextId}, hasApiKey=${!!apiKeyResult?.key}`)
      if (!apiKeyResult || !apiKeyResult.key) {
        this.logger.e("AI request error: No API key available for this chat")
        // Останавливаем typing при отсутствии API ключа
        if (this.activeTypingChats.has(queueItem.contextId)) {
          this.activeTypingChats.delete(queueItem.contextId)
          this.onTypingStop?.(queueItem.contextId)
        }
        // Отправляем сообщение об отсутствии API ключа
        this.onMessageResponse?.(queueItem.contextId, getMessage("ai_no_api_key_error"), this.nextMessageId++, queueItem.userMessageId, true)
        return
      }
      const apiKey = apiKeyResult.key
      const maskedApiKey = `${apiKey.substring(0, 8)}...${apiKey.slice(-4)}`
      this.logger.d(`[AIChatService] processQueuedMessage: используем ключ для чата ${queueItem.contextId}: ${maskedApiKey}`)
      const systemPrompt = await this.getSystemPromptForChat(Number(queueItem.contextId))

      // Добавляем сообщение пользователя в контекст
      context.messages.push({
        role: "user",
        content: queueItem.message,
        timestamp: Date.now(),
      })

      // Подготавливаем историю для AI
      const conversationHistory = context.messages.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }))

      // Вызов AI
      let response = ""
      try {
        response = await this.aiProvider.generateContent(
          apiKey,
          queueItem.message,
          conversationHistory,
          systemPrompt,
        )
      } catch (e: any) {
        // Подробное логирование ошибки AI
        const errorMsg = e?.response?.status
          ? `AI error: ${e.response.status} ${e.response.statusText || "Bad Request"}`
          : `AI error: ${e.message || "Unknown error"}`

        // Дополнительная информация для 403 ошибок
        if (e?.response?.status === 403) {
          this.logger.e(`${errorMsg} - Возможные причины: недействительный API ключ, исчерпана квота, заблокирован IP/прокси, регион не поддерживается`)
          if (e?.response?.data) {
            this.logger.e("Детали ошибки от API:", e.response.data)
          }
        } else {
          this.logger.e(errorMsg)
        }

        // Останавливаем typing при ошибке
        if (this.activeTypingChats.has(queueItem.contextId)) {
          this.activeTypingChats.delete(queueItem.contextId)
          this.onTypingStop?.(queueItem.contextId)
        }
        // Отправляем ошибку через колбэк
        this.onMessageResponse?.(queueItem.contextId, getMessage("ai_generation_error"), this.nextMessageId++, queueItem.userMessageId, true)
        return
      }

      // Добавляем ответ в контекст
      context.messages.push({
        role: "assistant",
        content: response,
        timestamp: Date.now(),
      })
      this.contextManager.setContext(queueItem.contextId, context)

      // Отправляем ответ через колбэк
      this.onMessageResponse?.(queueItem.contextId, response, this.nextMessageId++, queueItem.userMessageId)

      // Проверяем, есть ли еще сообщения для этого чата в очереди
      const hasMoreMessages = (this.messageQueues.get(queueItem.contextId)?.length ?? 0) > 0
      if (!hasMoreMessages && this.activeTypingChats.has(queueItem.contextId)) {
        // Больше нет сообщений для этого чата - выключаем typing
        this.activeTypingChats.delete(queueItem.contextId)
        this.onTypingStop?.(queueItem.contextId)
      }

      // После получения ответа применяем throttling (token bucket + задержка по длине ответа)
      await this.throttleManager.waitForThrottle(queueItem.contextId, response?.length || 0)

      console.info()
    } catch (error: any) {
      const errorMsg = error?.response?.status
        ? `AI request error: ${error.response.status} ${error.response.statusText || "Bad Request"}`
        : `AI request error: ${error.message || "Unknown error"}`
      this.logger.e(errorMsg)

      // Останавливаем typing при системной ошибке
      if (this.activeTypingChats.has(queueItem.contextId)) {
        this.activeTypingChats.delete(queueItem.contextId)
        this.onTypingStop?.(queueItem.contextId)
      }

      // Отправляем сообщение о серьезной системной ошибке
      this.onMessageResponse?.(queueItem.contextId, getMessage("ai_service_error"), this.nextMessageId++, queueItem.userMessageId, true)
    }
  }

  /**
   * Загрузка настроек чатов из БД
   */
  private async loadChatSettings(): Promise<void> {
    if (!this.chatRepository) {
      this.logger.d("No database connection, skipping chat settings loading")
      return
    }

    try {
      const activeChats = await this.chatRepository.getActiveAiChats()
      for (const chat of activeChats) {
        // Извлекаем config из chat.config если он там есть
        const config = (chat as any).config || null
        this.chatSettings.set(chat.id, { chat, config })
      }
      this.logger.i(`Loaded ${activeChats.length} active AI chats`)
    } catch (error) {
      this.logger.e("Error loading chat settings:", error)
    }
  }

  /**
   * Загрузка контекста из кэша
   */
  private async loadContextFromCache(contextId: string): Promise<ChatContext | null> {
    if (!this.redisService)
      return null

    try {
      const cached = await this.redisService.get<ChatContext>(`ai:context:${contextId}`)
      if (cached) {
        this.logger.d(`Loaded context for chat ${contextId} from cache`)
        return cached
      }
    } catch (error) {
      this.logger.e(`Error loading context ${contextId} from cache:`, error)
    }

    return null
  }

  /**
   * Сохранение контекста в кэш
   */
  private async saveContextToCache(contextId: string, context: ChatContext): Promise<void> {
    if (!this.redisService)
      return

    try {
      await this.redisService.set(
        `ai:context:${contextId}`,
        context,
        AI_CHAT_CONFIG.CONTEXT_TTL_SECONDS,
      )
      this.logger.d(`Saved context for chat ${contextId} to cache`)
    } catch (error) {
      this.logger.e(`Error saving context ${contextId} to cache:`, error)
    }
  }

  /**
   * Сохранение всех активных контекстов в кэш
   */
  private async saveAllContextsToCache(): Promise<void> {
    if (!this.redisService) {
      this.logger.d("No Redis connection, skipping context saving")
      return
    }

    try {
      const savePromises = Array.from(this.chatContexts.entries()).map(([contextId, context]) =>
        this.saveContextToCache(contextId, context),
      )

      await Promise.all(savePromises)
      this.logger.i(`Saved ${this.chatContexts.size} contexts to cache`)
    } catch (error) {
      this.logger.e("Error saving contexts to cache:", error)
    }
  }

  /**
   * Получение статистики контекста
   */
  getContextStats(contextId: string): {
    messages: number
    requestCount: number
  } | null {
    const context = this.chatContexts.get(contextId)
    if (!context)
      return null

    return {
      messages: context.messages.length,
      requestCount: context.requestCount,
    }
  }

  /**
   * Получение статистики throttling для чата
   */
  getThrottleStats(contextId: string): {
    bucketState: { tokens: number, capacity: number }
    lastRequestTime: number
  } {
    return this.throttleManager.getChatStats(contextId)
  }

  /**
   * Колбэки для интеграции с TelegramBotService
   */
  public onMessageResponse?: (contextId: string, response: string, messageId: number, userMessageId?: number, isError?: boolean) => void
  public onTypingStart?: (contextId: string) => void
  public onTypingStop?: (contextId: string) => void

  /**
   * Получить настройки чата
   */
  async getChatSettings(chatId: number): Promise<{ chat: Chat | null, config: ChatConfig | null }> {
    // Сначала проверяем кэш
    if (this.chatSettings.has(chatId)) {
      const cached = this.chatSettings.get(chatId)!
      return { chat: cached.chat, config: cached.config }
    }

    // Загружаем из БД
    if (this.chatRepository) {
      const result = await this.chatRepository.getChatWithConfig(chatId)

      if (result.chat) {
        // Извлекаем config из chat.config если он там есть
        const config = result.config || (result.chat as any).config || null
        const normalizedResult = {
          chat: result.chat,
          config,
        }

        // Кешируем нормализованный результат
        this.chatSettings.set(chatId, normalizedResult)
        return normalizedResult
      }
    }

    return { chat: null, config: null }
  }

  /**
   * Получить API ключ для чата (или вернуть null если отсутствует)
   */
  async getApiKeyForChat(chatId: number): Promise<{ key: string, isReal: boolean } | null> {
    const { chat, config } = await this.getChatSettings(chatId)

    this.logger.d(`[AIChatService] getApiKeyForChat: chatId=${chatId}, hasGeminiKey=${!!config?.geminiApiKey}`)

    // Если чат приватный — бот не должен работать
    if (chat?.type === "private") {
      this.logger.w(`AIChatService: попытка работы в приватном чате ${chatId} — запрещено.`)
      return null
    }

    // Если есть настоящий API ключ в конфиге чата, используем его
    if (config?.geminiApiKey) {
      const maskedKey = `${config.geminiApiKey.substring(0, 8)}...${config.geminiApiKey.slice(-4)}`
      this.logger.d(`[AIChatService] Найден ключ для чата ${chatId}: ${maskedKey}`)
      return {
        key: config.geminiApiKey,
        isReal: true,
      }
    }

    this.logger.d(`[AIChatService] Ключ для чата ${chatId} не найден!`)
    // API ключ отсутствует
    return null
  }

  /**
   * Получить системный промпт для чата
   */
  async getSystemPromptForChat(chatId: number): Promise<string> {
    const { config } = await this.getChatSettings(chatId)

    // Если есть кастомный системный промпт в конфигурации чата, используем его
    if (config?.systemPrompt) {
      return this.chatRepository?.buildSystemPromptString(config.systemPrompt) || AI_CHAT_CONFIG.DEFAULT_SYSTEM_PROMPT
    }

    // Иначе возвращаем дефолтный системный промпт
    return AI_CHAT_CONFIG.DEFAULT_SYSTEM_PROMPT
  }

  /**
   * Проверить включен ли ИИ в чате
   */
  async isAiEnabledForChat(chatId: number): Promise<boolean> {
    const { config } = await this.getChatSettings(chatId)
    return config?.aiEnabled ?? true
  }

  /**
   * Проверить является ли пользователь администратором чата
   */
  async isChatAdmin(chatId: number, userId: number): Promise<boolean> {
    if (!this.chatRepository)
      return false
    return await this.chatRepository.isAdmin(chatId, userId)
  }

  /**
   * Обновить настройки чата (только для администраторов)
   */
  async updateChatSettings(
    chatId: number,
    userId: number,
    updates: Partial<{
      geminiApiKey: string | null
      systemPrompt: SystemPromptData | null
      aiEnabled: boolean
    }>,
  ): Promise<boolean> {
    if (!this.chatRepository)
      return false

    // Проверяем права администратора
    const isAdmin = await this.isChatAdmin(chatId, userId)
    if (!isAdmin) {
      this.logger.w(`User ${userId} tried to update settings for chat ${chatId} without admin rights`)
      return false
    }

    const success = await this.chatRepository.updateChatConfig(chatId, updates)
    if (success) {
      // Обновляем кэш
      this.chatSettings.delete(chatId)
      this.logger.i(`Chat ${chatId} settings updated by user ${userId}`)
      // Принудительно обновляем кэш для этого чата
      await this.getChatSettings(chatId)
    }

    return success
  }

  /**
   * Очистить кэш настроек для конкретного чата
   */
  clearChatCache(chatId: number): void {
    this.logger.d(`🔄 Cache cleared for chat ${chatId}`)
    this.chatSettings.delete(chatId)
  }

  /**
   * Получение статистики сервиса
   */
  getStats(): object {
    return {
      activeContexts: this.chatContexts.size,
      queueLength: this.messageQueues.size,
      isProcessing: this.isProcessingQueue,
      activeChats: this.chatSettings.size,
      serviceStatus: "active",
    }
  }
}
