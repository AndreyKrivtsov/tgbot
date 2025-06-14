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
import { AdaptiveChatThrottleManager } from "./AdaptiveThrottleManager.js"

interface AIChatDependencies {
  database?: DatabaseService
  redis?: RedisService
}

interface ChatContext {
  chatId: string
  messages: ChatMessage[]
  lastActivity: number
  requestCount: number
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
  timestamp: number
}

interface MessageQueue {
  id: number
  message: string
  contextId: string
  timestamp: number
  retryCount: number
  userMessageId?: number
}

/**
 * Сервис AI чат-бота для общения с пользователями через Gemini
 */
export class AIChatService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: AIChatDependencies
  private chatContexts: Map<string, ChatContext> = new Map()
  private messageQueue: MessageQueue[] = []
  private isProcessingQueue = false
  private nextMessageId = 1
  private chatRepository?: ChatRepository
  private redisService?: RedisService
  private chatSettings: Map<number, { chat: Chat | null, config: ChatConfig | null }> = new Map() // Кэш настроек чатов
  private activeTypingChats: Set<string> = new Set() // Чаты где активен typing
  private throttleManager: AdaptiveChatThrottleManager // Адаптивный throttling менеджер
  private contextSaveTimer?: NodeJS.Timeout // Таймер автосохранения контекстов

  constructor(config: AppConfig, logger: Logger, dependencies: AIChatDependencies = {}) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
    this.throttleManager = new AdaptiveChatThrottleManager(logger)

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

    // Запускаем обработчик очереди
    this.startQueueProcessor()

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
    this.messageQueue = []
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
      // Проверяем размер очереди
      if (this.messageQueue.length >= AI_CHAT_CONFIG.MAX_QUEUE_SIZE) {
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
      const queueItem: MessageQueue = {
        id: this.nextMessageId++,
        message: contextualMessage,
        contextId: chatId.toString(),
        timestamp: Date.now(),
        retryCount: 0,
        userMessageId,
      }

      this.messageQueue.push(queueItem)

      // Включаем typing для этого чата если еще не включен
      if (!this.activeTypingChats.has(queueItem.contextId)) {
        this.activeTypingChats.add(queueItem.contextId)
      }

      this.logger.d(`Added message to queue from ${firstName} (${userId})`)

      return {
        success: true,
        queued: true,
        queuePosition: this.messageQueue.length,
      }
    } catch (error) {
      this.logger.e("Error processing message:", error)
      return {
        success: false,
        queued: false,
        reason: "Ошибка обработки сообщения",
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
  private startQueueProcessor(): void {
    if (this.isProcessingQueue)
      return

    this.isProcessingQueue = true

    const processNext = async () => {
      if (!this.isProcessingQueue)
        return

      try {
        const queueItem = this.messageQueue.shift()

        if (queueItem) {
          await this.processQueuedMessage(queueItem)
        }
      } catch (error) {
        this.logger.e("Queue processing error:", error)
      }

      // Планируем следующую обработку
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
  private async processQueuedMessage(queueItem: MessageQueue): Promise<void> {
    try {
      const context = await this.getOrCreateContext(queueItem.contextId)

      // Делаем запрос к AI с throttling, передаем retryCount для уменьшения контекста
      await this.throttledAIRequest(queueItem, queueItem.retryCount)
      this.onTypingStart?.(queueItem.contextId)

      context.requestCount++
    } catch (error) {
      this.logger.e("Error processing queued message:", error)

      // Проверка на отсутствие ключа или приватный чат
      if (
        error instanceof Error
        && (error.message.includes("No API key available for this chat") || error.message.includes("приватном чате"))
      ) {
        const noKeyMessage
          = "❗️ Для этого чата не настроен API-ключ."
        this.onMessageResponse?.(queueItem.contextId, noKeyMessage, queueItem.id, queueItem.userMessageId, true)

        // Удаляем все сообщения этого чата из очереди
        this.messageQueue = this.messageQueue.filter(item => item.contextId !== queueItem.contextId)

        // Проверяем, есть ли еще сообщения для этого чата в очереди
        const hasMoreMessages = this.messageQueue.some(item => item.contextId === queueItem.contextId)
        if (!hasMoreMessages && this.activeTypingChats.has(queueItem.contextId)) {
          // Больше нет сообщений для этого чата - выключаем typing
          this.activeTypingChats.delete(queueItem.contextId)
          this.onTypingStop?.(queueItem.contextId)
        }
        return
      }

      // Retry logic
      if (queueItem.retryCount < 2) {
        queueItem.retryCount++
        this.messageQueue.push(queueItem)
        this.logger.w(`Retrying message ${queueItem.id}, attempt ${queueItem.retryCount} (context will be reduced)`)
      } else {
        // Все попытки исчерпаны - отправляем сообщение об ошибке
        const errorMessage = getMessage("ai_service_error")
        this.onMessageResponse?.(queueItem.contextId, errorMessage, queueItem.id, queueItem.userMessageId, true)

        // Удаляем все сообщения этого чата из очереди
        this.messageQueue = this.messageQueue.filter(item => item.contextId !== queueItem.contextId)

        // Проверяем, есть ли еще сообщения для этого чата в очереди
        const hasMoreMessages = this.messageQueue.some(item => item.contextId === queueItem.contextId)
        if (!hasMoreMessages && this.activeTypingChats.has(queueItem.contextId)) {
          // Больше нет сообщений для этого чата - выключаем typing
          this.activeTypingChats.delete(queueItem.contextId)
          this.onTypingStop?.(queueItem.contextId)
        }
      }
    }
  }

  /**
   * Выполнение AI запроса с адаптивным ограничением скорости
   */
  private async throttledAIRequest(queueItem: MessageQueue, retryCount: number = 0): Promise<void> {
    try {
      // 1. Ждем разрешения от token bucket (перед запросом)
      await this.throttleManager.waitForRequestPermission(queueItem.contextId)

      const chatId = Number.parseInt(queueItem.contextId)

      // Получаем API ключ для чата
      const apiKeyResult = await this.getApiKeyForChat(chatId)
      if (!apiKeyResult) {
        throw new Error("No API key available for this chat")
      }

      this.onTypingStart?.(queueItem.contextId)

      // Получаем системный промпт для чата
      const systemPrompt = await this.getSystemPromptForChat(chatId)

      // Получаем или создаем контекст для этого чата
      const context = await this.getOrCreateContext(queueItem.contextId)

      // Добавляем сообщение пользователя в контекст
      context.messages.push({
        role: "user",
        content: queueItem.message,
        timestamp: Date.now(),
      })

      // Подготавливаем историю разговора для Gemini с учетом retry
      const conversationHistory = this.prepareConversationHistory(context, retryCount)

      // Создаем адаптер и делаем запрос к Gemini API
      const geminiAdapter = new GeminiAdapter()
      const response = await geminiAdapter.generateContent(
        apiKeyResult.key,
        queueItem.message,
        conversationHistory,
        systemPrompt,
      )

      if (response && response.trim()) {
        // Добавляем ответ в контекст
        context.messages.push({
          role: "assistant",
          content: response,
          timestamp: Date.now(),
        })

        // Простая обрезка контекста - оставляем только последние сообщения
        if (context.messages.length > AI_CHAT_CONFIG.MAX_CONTEXT_MESSAGES) {
          context.messages = context.messages.slice(-AI_CHAT_CONFIG.MAX_CONTEXT_MESSAGES)
        }

        // Обновляем время последней активности контекста
        context.lastActivity = Date.now()

        // 2. Применяем адаптивную задержку после получения ответа
        await this.throttleManager.applyPostResponseDelay(queueItem.contextId, response.length)

        // 3. Отправляем ответ
        this.onMessageResponse?.(queueItem.contextId, response, queueItem.id, queueItem.userMessageId, false)
      } else {
        this.logger.w(`Empty AI response for message ${queueItem.id}`)
      }

      // Проверяем, есть ли еще сообщения для этого чата в очереди
      const hasMoreMessages = this.messageQueue.some(item => item.contextId === queueItem.contextId)
      if (!hasMoreMessages && this.activeTypingChats.has(queueItem.contextId)) {
        // Больше нет сообщений для этого чата - выключаем typing
        this.activeTypingChats.delete(queueItem.contextId)
        this.onTypingStop?.(queueItem.contextId)
      }
    } catch (error) {
      this.logger.e("AI request error:", error)
      throw error
    }
  }

  /**
   * Подготовка истории разговора с уменьшением контекста при retry
   */
  private prepareConversationHistory(context: ChatContext, retryCount: number): GeminiMessage[] {
    // Получаем все сообщения кроме последнего (текущее сообщение пользователя)
    const allMessages = context.messages.slice(0, -1)

    // Если это первая попытка, используем весь контекст
    if (retryCount === 0) {
      this.logger.d(`Chat ${context.chatId}: Using full context (${allMessages.length} messages)`)
      return allMessages.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }))
    }

    // Для retry попыток уменьшаем контекст в 2^retryCount раз
    const reductionFactor = 2 ** retryCount
    const reducedLength = Math.max(1, Math.floor(allMessages.length / reductionFactor))

    // Берем последние сообщения (более релевантные)
    const reducedMessages = allMessages.slice(-reducedLength)

    this.logger.i(`Chat ${context.chatId}: Retry attempt ${retryCount}, reducing context from ${allMessages.length} to ${reducedMessages.length} messages (reduction factor: ${reductionFactor})`)

    return reducedMessages.map(msg => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    }))
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

    // Если чат приватный — бот не должен работать
    if (chat?.type === "private") {
      this.logger.w(`AIChatService: попытка работы в приватном чате ${chatId} — запрещено.`)
      return null
    }

    // Если есть настоящий API ключ в конфиге чата, используем его
    if (config?.geminiApiKey) {
      return {
        key: config.geminiApiKey,
        isReal: true,
      }
    }

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
      queueLength: this.messageQueue.length,
      isProcessing: this.isProcessingQueue,
      activeChats: this.chatSettings.size,
      serviceStatus: "active",
    }
  }
}
