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
  private contextManager: ChatContextManager
  private queueManager: ChatQueueManager
  private throttleManager: AdaptiveChatThrottleManager

  // Состояние обработки
  private nextMessageId = 1
  private contextSaveTimer?: NodeJS.Timeout

  // Колбэки для интеграции с TelegramBotService
  public onMessageResponse?: (contextId: string, response: string, messageId: number, userMessageId?: number, isError?: boolean) => void

  /**
   * Установка функции отправки typing action
   */
  public setSendTypingAction(sendTypingAction: (chatId: number) => Promise<void>): void {
    // Пересоздаем TypingManager с новой функцией
    this.typingManager = new TypingManager(this.logger, sendTypingAction)
  }

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: AIChatDependencies = {},
    aiProvider: IAIProvider,
    throttleManager?: AdaptiveChatThrottleManager,
    _sendTypingAction?: (chatId: number) => Promise<void>,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Создаем ChatRepository если есть database
    const chatRepository = dependencies.database
      ? new ChatRepository(dependencies.database)
      : undefined

    // Инициализируем специализированные компоненты
    this.chatConfigService = new ChatConfigService(logger, chatRepository)
    this.messageProcessor = new MessageProcessor(logger)
    this.aiResponseService = new AIResponseService(logger, aiProvider)
    this.contextManager = new ChatContextManager(dependencies.redis)
    this.queueManager = new ChatQueueManager()
    this.throttleManager = throttleManager || new AdaptiveChatThrottleManager(logger)

    // Инициализируем TypingManager с прямой отправкой typing
    const typingFunction = _sendTypingAction || (async () => {
      // Заглушка если функция не передана
    })
    this.typingManager = new TypingManager(logger, typingFunction)
  }

  name: string = "AIChatServiceRefactored"

  /**
   * Запуск сервиса (инициализация и старт)
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting AI chat service (refactored)...")
    await this.chatConfigService.loadAllChatSettings()
    this.startContextAutoSave()
    this.logger.i("✅ AI chat service started")
  }

  /**
   * Остановка сервиса (освобождение ресурсов)
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping AI chat service (refactored)...")
    if (this.contextSaveTimer) {
      clearInterval(this.contextSaveTimer)
      this.contextSaveTimer = undefined
    }
    await this.contextManager.saveAllToCache()
    this.typingManager.stopAllTyping()
    this.queueManager.clearAll()
    this.throttleManager.dispose()
    this.typingManager.dispose()
    this.contextManager.clearAll()
    this.logger.i("✅ AI chat service stopped")
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

    // Запускаем обработчик очереди (один на чат)
    this.startQueueProcessor(contextId)

    return {
      success: true,
      queued: true,
      queuePosition: queueLength + 1,
    }
  }

  /**
   * Запуск обработчика очереди для конкретного чата
   */
  private async startQueueProcessor(contextId: string): Promise<void> {
    this.logger.d(`Starting queue processor for context ${contextId}`)
    while (this.queueManager.getQueueLength(contextId) > 0) {
      const queueItem = this.queueManager.dequeue(contextId)
      if (!queueItem)
        break
      await this.processQueuedMessage(queueItem)
    }
  }

  /**
   * Обработка сообщения из очереди
   */
  private async processQueuedMessage(queueItem: MessageQueueItem): Promise<void> {
    try {
      // Получаем контекст
      const context = await this.getOrCreateContext(queueItem.contextId)

      console.log("КОНТЕКСТ", context)

      // Защита от порчи структуры messages
      if (!Array.isArray(context.messages)) {
        this.logger.e("context.messages is not an array! Восстанавливаю...")
        context.messages = []
      }

      // Получаем системный промпт
      const chatId = Number(queueItem.contextId)
      const systemPrompt = await this.chatConfigService.getSystemPromptForChat(chatId)

      // Получаем API ключ
      const apiKeyResult = await this.chatConfigService.getApiKeyForChat(chatId)
      if (!apiKeyResult) {
        throw new Error("API key not found")
      }

      // Добавляем сообщение в контекст
      if (!Array.isArray(context.messages)) {
        this.logger.e("context.messages is not an array! Восстанавливаю...")
        context.messages = []
      }
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

      // Добавляем ответ в контекст
      if (!Array.isArray(context.messages)) {
        this.logger.e("context.messages is not an array! Восстанавливаю...")
        context.messages = []
      }
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

  async initialize(): Promise<void> {
    // Для совместимости с интерфейсом IService, вызывает start
    await this.start()
  }

  public isBotMention(message: string, botUsername?: string, replyToBotMessage?: boolean): boolean {
    return this.messageProcessor.isBotMention(message, botUsername, replyToBotMessage)
  }
}
