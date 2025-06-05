import type { IService } from "../core/Container.js"
import type { Logger } from "../helpers/Logger.js"
import type { AppConfig } from "../config.js"

interface AIChatDependencies {
  aiService?: any
  database?: any
}

interface ChatContext {
  chatId: string
  messages: ChatMessage[]
  lastActivity: number
  requestCount: number
  dailyRequestCount: number
  lastDailyReset: number
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface MessageQueue {
  id: number
  message: string
  contextId: string
  timestamp: number
  retryCount: number
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
  private dailyLimit = 1500
  private throttleDelay = 3000 // 3 секунды между запросами

  constructor(config: AppConfig, logger: Logger, dependencies: AIChatDependencies = {}) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
  }

  /**
   * Инициализация сервиса AI чата
   */
  async initialize(): Promise<void> {
    this.logger.i("🤖 Initializing AI chat service...")
    
    // Загружаем контексты из БД если есть
    await this.loadChatContexts()
    
    this.logger.i("✅ AI chat service initialized")
  }

  /**
   * Запуск сервиса AI чата
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting AI chat service...")
    
    // Запускаем обработчик очереди
    this.startQueueProcessor()
    
    // Запускаем очистку старых контекстов
    this.startContextCleanup()
    
    this.logger.i("✅ AI chat service started")
  }

  /**
   * Остановка сервиса AI чата
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping AI chat service...")
    this.isProcessingQueue = false
    
    // Сохраняем контексты в БД
    await this.saveChatContexts()
    
    this.logger.i("✅ AI chat service stopped")
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing AI chat service...")
    await this.stop()
    this.chatContexts.clear()
    this.messageQueue = []
    this.logger.i("✅ AI chat service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.dependencies.aiService !== undefined
  }

  /**
   * Проверка, является ли сообщение обращением к боту
   */
  isBotMention(message: string, botUsername?: string): boolean {
    if (!message || message.trim().length === 0) {
      return false
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
      /^бот[,\s]/i
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
      cleaned = cleaned.replace(new RegExp(`@${botUsername}`, 'gi'), '').trim()
    }

    // Убираем стандартные обращения
    cleaned = cleaned.replace(/^эй.{0,3}бот\W?/i, '').trim()
    cleaned = cleaned.replace(/^альтрон\W?/gi, '').trim()
    cleaned = cleaned.replace(/^бот[,\s]/i, '').trim()

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
    isReply?: boolean
  ): Promise<{
    success: boolean
    queued: boolean
    reason?: string
    queuePosition?: number
  }> {
    try {
      // Проверяем лимиты
      const limitCheck = await this.checkDailyLimit(chatId.toString())
      if (!limitCheck.allowed) {
        return {
          success: false,
          queued: false,
          reason: limitCheck.reason
        }
      }

      // Проверяем размер очереди
      if (this.messageQueue.length >= 8) {
        return {
          success: false,
          queued: false,
          reason: "Слишком много сообщений в очереди. Попробуйте позже."
        }
      }

      // Подготавливаем сообщение для AI
      const cleanedMessage = this.cleanBotMention(message)
      const contextualMessage = this.prepareContextualMessage(
        cleanedMessage,
        username,
        firstName
      )

      // Добавляем в очередь
      const queueItem: MessageQueue = {
        id: this.nextMessageId++,
        message: contextualMessage,
        contextId: chatId.toString(),
        timestamp: Date.now(),
        retryCount: 0
      }

      this.messageQueue.push(queueItem)
      
      this.logger.d(`Added message to queue from ${firstName} (${userId}): ${cleanedMessage}`)

      return {
        success: true,
        queued: true,
        queuePosition: this.messageQueue.length
      }
    } catch (error) {
      this.logger.e("Error processing message:", error)
      return {
        success: false,
        queued: false,
        reason: "Ошибка обработки сообщения"
      }
    }
  }

  /**
   * Подготовка контекстного сообщения
   */
  private prepareContextualMessage(
    message: string,
    username?: string,
    firstName?: string
  ): string {
    const date = new Date()
    const messageDate = date.toISOString().replace(/:\d+\.\d+Z/gi, "").replace("T", " ")
    
    const userInfo = firstName ? 
      (username ? `@${username}][${firstName}` : `${firstName}`) :
      (username ? `@${username}` : "пользователь")
    
    return `[${messageDate}][${userInfo}] пользователь спрашивает тебя: ${message}`
  }

  /**
   * Проверка дневного лимита
   */
  private async checkDailyLimit(contextId: string): Promise<{
    allowed: boolean
    reason?: string
    remaining: number
  }> {
    const context = this.getOrCreateContext(contextId)
    
    // Проверяем, нужно ли сбросить дневной счетчик
    const now = Date.now()
    const dayInMs = 24 * 60 * 60 * 1000
    
    if (now - context.lastDailyReset > dayInMs) {
      context.dailyRequestCount = 0
      context.lastDailyReset = now
    }

    const remaining = this.dailyLimit - context.dailyRequestCount
    
    if (context.dailyRequestCount >= this.dailyLimit) {
      return {
        allowed: false,
        reason: `Превышен дневной лимит запросов (${this.dailyLimit}). Попробуйте завтра.`,
        remaining: 0
      }
    }

    return {
      allowed: true,
      remaining
    }
  }

  /**
   * Получение или создание контекста чата
   */
  private getOrCreateContext(contextId: string): ChatContext {
    let context = this.chatContexts.get(contextId)
    
    if (!context) {
      const now = Date.now()
      context = {
        chatId: contextId,
        messages: [],
        lastActivity: now,
        requestCount: 0,
        dailyRequestCount: 0,
        lastDailyReset: now
      }
      this.chatContexts.set(contextId, context)
    }

    context.lastActivity = Date.now()
    return context
  }

  /**
   * Запуск обработчика очереди сообщений
   */
  private startQueueProcessor(): void {
    if (this.isProcessingQueue) return

    this.isProcessingQueue = true

    const processNext = async () => {
      if (!this.isProcessingQueue) return

      try {
        const queueItem = this.messageQueue.shift()
        
        if (queueItem) {
          await this.processQueuedMessage(queueItem)
        }
      } catch (error) {
        this.logger.e("Queue processing error:", error)
      }

      // Планируем следующую обработку
      setTimeout(processNext, 1000)
    }

    processNext()
  }

  /**
   * Обработка сообщения из очереди
   */
  private async processQueuedMessage(queueItem: MessageQueue): Promise<void> {
    try {
      if (!this.dependencies.aiService) {
        this.logger.e("AI service not available for processing message")
        return
      }

      const context = this.getOrCreateContext(queueItem.contextId)
      
      // Добавляем сообщение пользователя в контекст
      context.messages.push({
        role: 'user',
        content: queueItem.message,
        timestamp: queueItem.timestamp
      })

      // Ограничиваем размер контекста
      if (context.messages.length > 20) {
        context.messages = context.messages.slice(-20)
      }

      // Делаем запрос к AI с throttling
      await this.throttledAIRequest(queueItem)
      
      context.requestCount++
      context.dailyRequestCount++

    } catch (error) {
      this.logger.e("Error processing queued message:", error)
      
      // Retry logic
      if (queueItem.retryCount < 3) {
        queueItem.retryCount++
        this.messageQueue.push(queueItem)
        this.logger.w(`Retrying message ${queueItem.id}, attempt ${queueItem.retryCount}`)
      }
    }
  }

  /**
   * Запрос к AI с ограничением скорости
   */
  private async throttledAIRequest(queueItem: MessageQueue): Promise<void> {
    try {
      // Эмитируем typing индикатор
      this.onTypingStart?.(queueItem.contextId)

      const response = await this.dependencies.aiService.request?.(
        queueItem.contextId,
        queueItem.message
      )

      if (response && response.trim()) {
        // Добавляем ответ в контекст
        const context = this.getOrCreateContext(queueItem.contextId)
        context.messages.push({
          role: 'assistant',
          content: response,
          timestamp: Date.now()
        })

        // Отправляем ответ
        this.onMessageResponse?.(queueItem.contextId, response, queueItem.id)
        
        this.logger.d(`AI response sent for message ${queueItem.id}`)
      } else {
        this.logger.w(`Empty AI response for message ${queueItem.id}`)
      }

      // Ждем между запросами
      await new Promise(resolve => setTimeout(resolve, this.throttleDelay))

    } catch (error) {
      this.logger.e("AI request error:", error)
      throw error
    } finally {
      this.onTypingStop?.(queueItem.contextId)
    }
  }

  /**
   * Очистка старых контекстов
   */
  private startContextCleanup(): void {
    const cleanup = () => {
      const now = Date.now()
      const maxAge = 24 * 60 * 60 * 1000 // 24 часа

      for (const [contextId, context] of this.chatContexts.entries()) {
        if (now - context.lastActivity > maxAge) {
          this.chatContexts.delete(contextId)
          this.logger.d(`Cleaned up old context: ${contextId}`)
        }
      }
    }

    // Запускаем очистку каждый час
    setInterval(cleanup, 60 * 60 * 1000)
  }

  /**
   * Загрузка контекстов из БД
   */
  private async loadChatContexts(): Promise<void> {
    // TODO: Реализация загрузки из БД
    this.logger.d("Loading chat contexts from database...")
  }

  /**
   * Сохранение контекстов в БД
   */
  private async saveChatContexts(): Promise<void> {
    // TODO: Реализация сохранения в БД
    this.logger.d("Saving chat contexts to database...")
  }

  /**
   * Настройка дневного лимита
   */
  setDailyLimit(limit: number): void {
    this.dailyLimit = Math.max(1, limit)
    this.logger.i(`Set daily limit: ${this.dailyLimit}`)
  }

  /**
   * Получение статистики контекста
   */
  getContextStats(contextId: string): {
    messages: number
    requestCount: number
    dailyRequestCount: number
    remaining: number
  } | null {
    const context = this.chatContexts.get(contextId)
    if (!context) return null

    return {
      messages: context.messages.length,
      requestCount: context.requestCount,
      dailyRequestCount: context.dailyRequestCount,
      remaining: this.dailyLimit - context.dailyRequestCount
    }
  }

  /**
   * Колбэки для интеграции с TelegramBotService
   */
  public onMessageResponse?: (contextId: string, response: string, messageId: number) => void
  public onTypingStart?: (contextId: string) => void
  public onTypingStop?: (contextId: string) => void

  /**
   * Получение статистики сервиса
   */
  getStats(): object {
    return {
      activeContexts: this.chatContexts.size,
      queueLength: this.messageQueue.length,
      dailyLimit: this.dailyLimit,
      isProcessing: this.isProcessingQueue,
      serviceStatus: "active"
    }
  }
} 