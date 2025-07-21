import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { DatabaseService } from "../DatabaseService/index.js"
import type { RedisService } from "../RedisService/index.js"
import type { EventBus } from "../../core/EventBus.js"
import { CacheService } from "../CacheService/index.js"
import { ModerationTools } from "./ModerationTools.js"
import { ChatRepository } from "../../repository/ChatRepository.js"
import { ChatConfigService } from "./ChatConfigService.js"
import { MessageProcessor } from "./MessageProcessor.js"
import { AIResponseService } from "./AIResponseService.js"
import { TypingManager } from "./TypingManager.js"
import { ChatContextManager } from "./ChatContextManager.js"
import type { ChatContext } from "./ChatContextManager.js"
import { ChatQueueManager } from "./ChatQueueManager.js"
import { AdaptiveChatThrottleManager } from "./AdaptiveThrottleManager.js"
import type { MessageQueueItem } from "./MessageQueue.js"
import type { IAIProvider } from "./providers/IAIProvider.js"
import type { IAIResponseService, IChatConfigService, IMessageProcessor, IService, ITypingManager, ProcessMessageResult } from "./interfaces.js"

import { AI_CHAT_CONFIG } from "../../constants.js"

interface AIChatDependencies {
  database?: DatabaseService
  redis?: RedisService
  eventBus?: EventBus
}

/**
 * Адаптер для RedisService к CacheService интерфейсу
 */
class RedisAsCacheService extends CacheService {
  constructor(private redis: RedisService, config: any, logger: any) {
    super(config, logger)
  }

  async initialize(): Promise<void> {
    // Redis уже инициализирован
  }

  async start(): Promise<void> {
    // Redis уже запущен
  }

  async stop(): Promise<void> {
    // Не останавливаем Redis, он управляется отдельно
  }

  async dispose(): Promise<void> {
    // Не освобождаем Redis, он управляется отдельно
  }

  isHealthy(): boolean {
    return this.redis.isHealthy()
  }

  set(key: string, value: any, ttl?: number): void {
    // Асинхронно устанавливаем значение, не блокируя
    this.redis.set(key, JSON.stringify(value), ttl)
  }

  get(_key: string): any {
    // Синхронный get не поддерживается Redis, возвращаем null
    // Для реального получения используйте getAsync
    return null
  }

  delete(key: string): boolean {
    // Асинхронно удаляем
    this.redis.del(key)
    return true
  }

  clear(): void {
    // Асинхронно очищаем
    this.redis.keys("*").then((keys) => {
      if (keys.length > 0) {
        keys.forEach(key => this.redis.del(key))
      }
    })
  }

  getStats(): object {
    return {
      size: 0, // Не можем получить размер синхронно
      isConnected: this.redis.isHealthy(),
      status: this.redis.isHealthy() ? "active" : "inactive",
    }
  }

  // Дополнительные асинхронные методы
  async getAsync(key: string): Promise<any> {
    const value = await this.redis.get(key)
    return value ? JSON.parse(value) : null
  }

  async setAsync(key: string, value: any, ttl?: number): Promise<void> {
    await this.redis.set(key, JSON.stringify(value), ttl)
  }

  async deleteAsync(key: string): Promise<boolean> {
    return await this.redis.del(key)
  }

  async hasAsync(key: string): Promise<boolean> {
    return await this.redis.exists(key)
  }

  async sizeAsync(): Promise<number> {
    const keys = await this.redis.keys("*")
    return keys.length
  }

  async clearAsync(): Promise<void> {
    const keys = await this.redis.keys("*")
    if (keys.length > 0) {
      await Promise.all(keys.map(key => this.redis.del(key)))
    }
  }
}

/**
 * Расширенный ChatQueueManager со статистикой
 */
class ExtendedChatQueueManager extends ChatQueueManager {
  getStats(): object {
    return {
      totalQueues: this.hasQueue.length,
      // Добавьте другие статистики если нужно
    }
  }
}

/**
 * Расширенный ChatContextManager со статистикой
 */
class ExtendedChatContextManager extends ChatContextManager {
  getStats(): object {
    return {
      activeContexts: Object.keys(this.getContext).length,
      // Добавьте другие статистики если нужно
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

/**
 * Рефакторированный сервис AI чат-бота
 * Теперь работает как оркестратор, делегируя задачи специализированным компонентам
 */
export class AIChatServiceRefactored implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: AIChatDependencies

  // Специализированные компоненты
  private chatConfigService: IChatConfigService
  private messageProcessor: IMessageProcessor
  private aiResponseService: IAIResponseService
  private typingManager: ITypingManager
  private contextManager: ExtendedChatContextManager
  private queueManager: ExtendedChatQueueManager
  private throttleManager: AdaptiveChatThrottleManager
  private moderationTools?: ModerationTools

  // Состояние обработки
  private queueProcessors: Set<string> = new Set()
  private isProcessingQueue = false
  private nextMessageId = 1
  private contextSaveTimer?: NodeJS.Timeout

  // Колбэки для интеграции с TelegramBotService
  public onMessageResponse?: (contextId: string, response: string, messageId: number, userMessageId?: number, isError?: boolean) => void
  public onTypingStart?: (contextId: string) => void
  public onTypingStop?: (contextId: string) => void

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: AIChatDependencies = {},
    aiProvider: IAIProvider,
    throttleManager?: AdaptiveChatThrottleManager,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Создаем ChatRepository если есть database
    const chatRepository = dependencies.database
      ? new ChatRepository(dependencies.database)
      : undefined

    // Создаем CacheService wrapper для Redis
    const cacheService = dependencies.redis
      ? new RedisAsCacheService(dependencies.redis, config, logger)
      : undefined

    // Инициализируем специализированные компоненты
    this.chatConfigService = new ChatConfigService(logger, chatRepository)
    this.messageProcessor = new MessageProcessor(logger)
    this.aiResponseService = new AIResponseService(logger, aiProvider)
    this.contextManager = new ExtendedChatContextManager(cacheService)
    this.queueManager = new ExtendedChatQueueManager()
    this.throttleManager = throttleManager || new AdaptiveChatThrottleManager(logger)

    // Инициализируем TypingManager с колбэками
    this.typingManager = new TypingManager(logger, {
      onStart: (contextId: string) => {
        this.onTypingStart?.(contextId)
      },
      onStop: (contextId: string) => {
        this.onTypingStop?.(contextId)
      },
    })

    // Инициализируем ModerationTools если есть EventBus
    if (dependencies.eventBus) {
      this.moderationTools = new ModerationTools(dependencies.eventBus, logger)
    }
  }

  name: string = "AIChatServiceRefactored"

  /**
   * Инициализация сервиса
   */
  async initialize(): Promise<void> {
    this.logger.i("🤖 Initializing AI chat service (refactored)...")

    // Загружаем настройки чатов
    await this.chatConfigService.loadAllChatSettings()

    this.logger.i("✅ AI chat service initialized")
  }

  /**
   * Запуск сервиса
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting AI chat service (refactored)...")

    // Запускаем автосохранение контекстов
    this.startContextAutoSave()

    this.logger.i("✅ AI chat service started")
  }

  /**
   * Остановка сервиса
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping AI chat service (refactored)...")

    this.isProcessingQueue = false

    // Останавливаем автосохранение
    if (this.contextSaveTimer) {
      clearInterval(this.contextSaveTimer)
      this.contextSaveTimer = undefined
    }

    // Сохраняем все контексты
    await this.contextManager.saveAllToCache()

    // Останавливаем все typing индикаторы
    this.typingManager.stopAllTyping()

    // Очищаем все очереди
    this.queueManager.clearAll()
    this.queueProcessors.clear()

    this.logger.i("✅ AI chat service stopped")
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing AI chat service (refactored)...")

    await this.stop()
    this.throttleManager.dispose()
    this.typingManager.dispose()
    this.contextManager.clearAll()

    this.logger.i("✅ AI chat service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.dependencies.redis !== undefined
  }

  /**
   * Основной метод обработки сообщения
   */
  async processMessage(
    userId: number,
    chatId: number,
    message: string,
    username?: string,
    firstName?: string,
    userMessageId?: number,
  ): Promise<ProcessMessageResult> {
    // Проверяем, включен ли AI в чате
    const isAiEnabled = await this.chatConfigService.isAiEnabledForChat(chatId)
    if (!isAiEnabled) {
      return {
        success: false,
        queued: false,
        reason: "AI отключен в этом чате",
      }
    }

    // Получаем API ключ
    const apiKeyResult = await this.chatConfigService.getApiKeyForChat(chatId)
    if (!apiKeyResult) {
      return {
        success: false,
        queued: false,
        reason: "API ключ не найден",
      }
    }

    // Валидируем сообщение
    const validation = this.messageProcessor.validateMessage(message)
    if (!validation.isValid) {
      return {
        success: false,
        queued: false,
        reason: validation.reason,
      }
    }

    // Подготавливаем контекстуальное сообщение
    const contextualMessage = this.messageProcessor.prepareContextualMessage(
      message,
      username,
      firstName,
    )

    // Добавляем в очередь
    const contextId = `${chatId}`
    const messageId = this.nextMessageId++

    const queueItem: MessageQueueItem = {
      id: messageId,
      message: contextualMessage.content,
      contextId,
      timestamp: Date.now(),
      retryCount: 0,
      userMessageId,
    }

    // Проверяем размер очереди
    const queueLength = this.queueManager.getQueueLength(contextId)
    if (queueLength >= AI_CHAT_CONFIG.MAX_QUEUE_SIZE) {
      return {
        success: false,
        queued: false,
        reason: "Слишком много сообщений в очереди",
      }
    }

    // Добавляем в очередь
    this.queueManager.enqueue(contextId, queueItem)

    // Запускаем typing индикатор
    this.typingManager.startTyping(contextId)

    // Запускаем обработчик очереди если не запущен
    if (!this.queueProcessors.has(contextId)) {
      this.startQueueProcessor(contextId)
    }

    return {
      success: true,
      queued: true,
      queuePosition: queueLength + 1,
    }
  }

  /**
   * Запуск обработчика очереди для конкретного чата
   */
  private startQueueProcessor(contextId: string): void {
    this.queueProcessors.add(contextId)
    this.logger.d(`Starting queue processor for context ${contextId}`)

    const processNext = async () => {
      const queueItem = this.queueManager.dequeue(contextId)
      if (!queueItem) {
        this.queueProcessors.delete(contextId)
        return
      }

      await this.processQueuedMessage(queueItem)

      // Продолжаем обработку если есть еще сообщения
      if (this.queueManager.getQueueLength(contextId) > 0) {
        setTimeout(processNext, 100)
      } else {
        this.queueProcessors.delete(contextId)
      }
    }

    processNext()
  }

  /**
   * Обработка сообщения из очереди
   */
  private async processQueuedMessage(queueItem: MessageQueueItem): Promise<void> {
    try {
      // Получаем контекст
      const context = await this.getOrCreateContext(queueItem.contextId)

      // Получаем системный промпт
      const chatId = Number(queueItem.contextId)
      const systemPrompt = await this.chatConfigService.getSystemPromptForChat(chatId)

      // Получаем API ключ
      const apiKeyResult = await this.chatConfigService.getApiKeyForChat(chatId)
      if (!apiKeyResult) {
        throw new Error("API key not found")
      }

      // Добавляем сообщение в контекст
      context.messages.push({
        role: "user",
        content: queueItem.message,
        timestamp: Date.now(),
      })

      // Генерируем ответ
      const responseResult = await this.aiResponseService.generateResponse({
        message: queueItem.message,
        context,
        systemPrompt,
        apiKey: apiKeyResult.key,
        tools: this.getModerationFunctionDeclarations(),
      })

      if (!responseResult.success) {
        // Отправляем ошибку
        const errorMessage = `Ошибка AI: ${responseResult.error || "Unknown error"}`
        this.onMessageResponse?.(
          queueItem.contextId,
          errorMessage,
          queueItem.id,
          queueItem.userMessageId,
          true,
        )
        return
      }

      // Проверяем на вызов функции модерации
      if (responseResult.functionCall) {
        const functionResult = await this.executeModerationFunction(
          responseResult.functionCall.name,
          responseResult.functionCall.args,
        )

        // Отправляем результат выполнения функции
        const resultMessage = functionResult.success
          ? `✅ ${functionResult.message}`
          : `❌ ${functionResult.message}`

        this.onMessageResponse?.(
          queueItem.contextId,
          resultMessage,
          queueItem.id,
          queueItem.userMessageId,
          !functionResult.success,
        )
        return
      }

      // Добавляем ответ в контекст
      context.messages.push({
        role: "model",
        content: responseResult.response!,
        timestamp: Date.now(),
      })

      // Обновляем контекст
      context.lastActivity = Date.now()
      context.requestCount++

      // Обрезаем контекст если слишком большой
      if (context.messages.length > AI_CHAT_CONFIG.MAX_CONTEXT_MESSAGES) {
        context.messages = context.messages.slice(-AI_CHAT_CONFIG.MAX_CONTEXT_MESSAGES)
      }

      // Сохраняем контекст
      this.contextManager.setContext(queueItem.contextId, context)

      // Отправляем ответ
      this.onMessageResponse?.(
        queueItem.contextId,
        responseResult.response!,
        queueItem.id,
        queueItem.userMessageId,
        false,
      )
    } catch (error) {
      this.logger.e("Error processing queued message:", error)

      // Отправляем ошибку
      const errorMessage = `Ошибка обработки: ${error instanceof Error ? error.message : "Unknown error"}`
      this.onMessageResponse?.(
        queueItem.contextId,
        errorMessage,
        queueItem.id,
        queueItem.userMessageId,
        true,
      )
    } finally {
      // Останавливаем typing для этого чата
      this.typingManager.stopTyping(queueItem.contextId)
    }
  }

  /**
   * Получение или создание контекста
   */
  private async getOrCreateContext(contextId: string): Promise<ChatContext> {
    let context = this.contextManager.getContext(contextId)

    if (!context) {
      // Пытаемся загрузить из кеша
      const cachedContext = await this.contextManager.loadFromCache(contextId)
      if (cachedContext) {
        context = cachedContext
        this.contextManager.setContext(contextId, context)
      } else {
        // Создаем новый контекст
        context = this.contextManager.createContext(contextId)
      }
    }

    return context
  }

  /**
   * Автосохранение контекстов
   */
  private startContextAutoSave(): void {
    this.contextSaveTimer = setInterval(async () => {
      try {
        await this.contextManager.saveAllToCache()
        this.logger.d("Auto-saved all contexts to cache")
      } catch (error) {
        this.logger.e("Error auto-saving contexts:", error)
      }
    }, AI_CHAT_CONFIG.CONTEXT_SAVE_INTERVAL_MS)
  }

  // Методы для совместимости с старым интерфейсом
  isBotMention(message: string, botUsername?: string, replyToBotMessage?: boolean): boolean {
    return this.messageProcessor.isBotMention(message, botUsername, replyToBotMessage)
  }

  cleanBotMention(message: string, botUsername?: string): string {
    return this.messageProcessor.cleanBotMention(message, botUsername)
  }

  async getChatSettings(chatId: number) {
    return await this.chatConfigService.getChatSettings(chatId)
  }

  async updateChatSettings(chatId: number, userId: number, updates: any) {
    return await this.chatConfigService.updateChatSettings(chatId, userId, updates)
  }

  async isAiEnabledForChat(chatId: number): Promise<boolean> {
    return await this.chatConfigService.isAiEnabledForChat(chatId)
  }

  async isChatAdmin(chatId: number, userId: number): Promise<boolean> {
    return await this.chatConfigService.isChatAdmin(chatId, userId)
  }

  clearChatCache(chatId: number): void {
    this.chatConfigService.clearChatCache(chatId)
  }

  getContextStats(contextId: string) {
    const context = this.contextManager.getContext(contextId)
    if (!context)
      return null

    return {
      messages: context.messages.length,
      requestCount: context.requestCount,
    }
  }

  getThrottleStats(_contextId: string) {
    return this.throttleManager.getStats()
  }

  getStats(): object {
    return {
      service: "AIChatServiceRefactored",
      queues: this.queueManager.getStats(),
      contexts: this.contextManager.getStats(),
      throttle: this.throttleManager.getStats(),
      typing: this.typingManager.getStats(),
    }
  }

  /**
   * Получить объявления функций модерации для Gemini API
   */
  getModerationFunctionDeclarations() {
    if (!this.moderationTools) {
      return []
    }
    return this.moderationTools.getFunctionDeclarations()
  }

  /**
   * Выполнить функцию модерации
   */
  async executeModerationFunction(functionName: string, args: any) {
    if (!this.moderationTools) {
      return {
        success: false,
        message: "Инструменты модерации не инициализированы",
        error: "ModerationTools not initialized",
      }
    }
    return await this.moderationTools.executeFunction(functionName, args)
  }
}
