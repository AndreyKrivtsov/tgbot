import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { DatabaseService } from "../DatabaseService/index.js"
import type { RedisService } from "../RedisService/index.js"
import type { EventBus } from "../../core/EventBus.js"
// EVENTS не используется в ordered-сценарии
// ChatConfigService удалён: используется ChatSettingsRepositoryAdapter
import { MessageProcessor } from "./MessageProcessor.js"
import { AIResponseService } from "./AIResponseService.js"
import { ChatContextManager } from "./ChatContextManager.js"
import type { ChatContext } from "./ChatContextManager.js"
import { TypingManager } from "../../helpers/ai/TypingManager.js"
import { ChatQueueManager } from "../../helpers/ai/ChatQueueManager.js"
import { AdaptiveChatThrottleManager } from "../../helpers/ai/AdaptiveThrottleManager.js"
import type { MessageQueueItem } from "../../helpers/ai/MessageQueue.js"
import type { IAIProvider } from "./providers/IAIProvider.js"
import type { AIChatActionsPort, AIChatRepositoryPort, AIResponseResult, IAIResponseService, IChatConfigService, IMessageProcessor, ITypingManager, ProcessMessageResult } from "./interfaces.js"
import { AI_CHAT_CONFIG } from "../../constants.js"

interface AIChatDependencies {
  database?: DatabaseService
  redis?: RedisService
  eventBus?: EventBus
  actions?: AIChatActionsPort
  repository?: AIChatRepositoryPort
}

export class AIChatService {
  private config: AppConfig
  private logger: Logger
  private dependencies: AIChatDependencies
  private eventBus?: EventBus

  private chatConfigService: IChatConfigService
  private messageProcessor: IMessageProcessor
  private aiResponseService: IAIResponseService
  private typingManager: ITypingManager
  private contextManager: ChatContextManager
  private queueManager: ChatQueueManager
  private throttleManager: AdaptiveChatThrottleManager

  private nextMessageId = 1
  private contextSaveTimer?: NodeJS.Timeout
  private processingContexts: Set<string> = new Set()

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
    this.eventBus = dependencies.eventBus

    // Используем только репозиторийный порт (ChatSettingsRepositoryAdapter)
    if (!dependencies.repository) {
      throw new Error("AIChatService requires repository adapter (ChatSettingsRepositoryAdapter)")
    }
    const repo = dependencies.repository
    this.chatConfigService = {
      loadAllChatSettings: async () => {},
      isAiEnabledForChat: repo.isAiEnabledForChat.bind(repo),
      getApiKeyForChat: repo.getApiKeyForChat.bind(repo),
      getSystemPromptForChat: repo.getSystemPromptForChat.bind(repo),
    } as any

    this.messageProcessor = new MessageProcessor(logger)
    this.aiResponseService = new AIResponseService(logger, aiProvider)
    this.contextManager = new ChatContextManager(dependencies.redis)
    this.queueManager = new ChatQueueManager()
    this.throttleManager = throttleManager || new AdaptiveChatThrottleManager(logger)

    const typingFunction = _sendTypingAction
      || dependencies.actions?.sendTyping
      || (async () => {})
    this.typingManager = new TypingManager(logger, typingFunction)
  }

  name: string = "AIChatService"

  async start(): Promise<void> {
    this.logger.i("🚀 Starting AI chat service...")
    await this.chatConfigService.loadAllChatSettings()
    this.startContextAutoSave()
    this.logger.i("✅ AI chat service started")
  }

  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping AI chat service...")
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

  isHealthy(): boolean {
    return this.dependencies.redis !== undefined
  }

  async processMessage(
    userId: number,
    chatId: number,
    message: string,
    username?: string,
    firstName?: string,
    userMessageId?: number,
  ): Promise<ProcessMessageResult> {
    const isAiEnabled = await this.chatConfigService.isAiEnabledForChat(chatId)
    if (!isAiEnabled) {
      return { success: false, queued: false, reason: "AI отключен в этом чате" }
    }

    const apiKeyResult = await this.chatConfigService.getApiKeyForChat(chatId)
    if (!apiKeyResult) {
      return { success: false, queued: false, reason: "API ключ не найден" }
    }

    const validation = this.messageProcessor.validateMessage(message)
    if (!validation.isValid) {
      return { success: false, queued: false, reason: validation.reason }
    }

    const contextualMessage = this.messageProcessor.prepareContextualMessage(message, username, firstName)

    const contextId = `${chatId}`
    const messageId = this.nextMessageId++

    const queueItem: MessageQueueItem & { apiKey?: string } = {
      id: messageId,
      message: contextualMessage.content,
      contextId,
      timestamp: Date.now(),
      retryCount: 0,
      userMessageId,
      apiKey: apiKeyResult.key,
    }

    const queueLength = this.queueManager.getQueueLength(contextId)
    if (queueLength >= AI_CHAT_CONFIG.MAX_QUEUE_SIZE) {
      return { success: false, queued: false, reason: "Слишком много сообщений в очереди" }
    }

    this.queueManager.enqueue(contextId, queueItem)
    this.typingManager.startTyping(contextId)
    void this.startQueueProcessor(contextId)

    return { success: true, queued: true, queuePosition: queueLength + 1 }
  }

  private async startQueueProcessor(contextId: string): Promise<void> {
    if (this.processingContexts.has(contextId)) {
      return
    }
    this.processingContexts.add(contextId)
    try {
      while (this.queueManager.getQueueLength(contextId) > 0) {
        const queueItem = this.queueManager.dequeue(contextId)
        if (!queueItem)
          break
        await this.processQueuedMessage(queueItem)
      }
    } finally {
      this.processingContexts.delete(contextId)
    }
  }

  // ==========================================================================
  // МЕТОДЫ ДЛЯ РАБОТЫ С КОНТЕКСТОМ (перенесено из ContextLifecycle)
  // ==========================================================================

  private async getOrCreateContext(contextId: string): Promise<ChatContext> {
    let context = this.contextManager.getContext(contextId)
    if (!context) {
      const cached = await this.contextManager.loadFromCache(contextId)
      if (cached) {
        context = cached
        this.contextManager.setContext(contextId, context)
      } else {
        context = this.contextManager.createContext(contextId)
      }
    }
    this.ensureContextShape(context)
    return context
  }

  private ensureContextShape(context: ChatContext): void {
    if (!Array.isArray(context.messages)) {
      this.logger.e("context.messages is not an array! Восстанавливаю...")
      context.messages = []
    }
  }

  private appendUserMessage(context: ChatContext, text: string): void {
    context.messages.push({ role: "user", content: text, timestamp: Date.now() })
  }

  private appendModelMessage(context: ChatContext, text: string): void {
    context.messages.push({ role: "model", content: text, timestamp: Date.now() })
  }

  private pruneContextByLimit(context: ChatContext, maxMessages: number): void {
    if (context.messages.length > maxMessages) {
      context.messages = context.messages.slice(-maxMessages)
    }
  }

  private touchContext(context: ChatContext, incrementRequestCount: boolean = false): void {
    context.lastActivity = Date.now()
    if (incrementRequestCount) {
      context.requestCount++
    }
  }

  private commitContext(contextId: string, context: ChatContext): void {
    this.contextManager.setContext(contextId, context)
  }

  // ==========================================================================
  // МЕТОДЫ ДЛЯ ОТПРАВКИ ОТВЕТОВ (перенесено из ResponseDispatcher)
  // ==========================================================================

  private async emitSuccess(contextId: string, text: string, messageId: number, userMessageId?: number): Promise<void> {
    const chatId = Number.parseInt(contextId)
    if (!this.eventBus)
      return

    try {
      await this.eventBus.emitAIResponse({
        chatId,
        text,
        replyToMessageId: userMessageId,
        isError: false,
        actions: [
          {
            type: "sendMessage",
            params: {
              text,
              replyToMessageId: userMessageId,
            },
          },
        ],
      })
    } catch (error) {
      this.logger.e("Error emitting AI success:", error)
    }
  }

  private async emitError(contextId: string, errorText: string, messageId: number, userMessageId?: number): Promise<void> {
    const chatId = Number.parseInt(contextId)
    if (!this.eventBus)
      return

    try {
      await this.eventBus.emitAIResponse({
        chatId,
        text: errorText,
        replyToMessageId: userMessageId,
        isError: true,
        actions: [
          {
            type: "sendMessage",
            params: {
              text: errorText,
              autoDelete: 20000, // Ошибки удаляются через 20 сек
            },
          },
        ],
      })
    } catch (error) {
      this.logger.e("Error emitting AI error:", error)
    }
  }

  // ==========================================================================
  // ОБРАБОТКА СООБЩЕНИЙ (упрощенная логика из MessagePipeline)
  // ==========================================================================

  private async processQueuedMessage(queueItem: MessageQueueItem & { apiKey?: string }): Promise<void> {
    try {
      const context = await this.getOrCreateContext(queueItem.contextId)

      const chatId = Number(queueItem.contextId)
      const systemPrompt = await this.chatConfigService.getSystemPromptForChat(chatId)
      const apiKey = queueItem.apiKey || (await this.chatConfigService.getApiKeyForChat(chatId))?.key

      if (!apiKey) {
        this.emitError(queueItem.contextId, "API key not found", queueItem.id, queueItem.userMessageId)
        return
      }

      // Применяем троттлинг ДО обращения к AI API, основываясь на размере входного сообщения
      await this.throttleManager.waitForThrottle(queueItem.contextId, queueItem.message.length)

      this.appendUserMessage(context, queueItem.message)

      const responseResult: AIResponseResult = await this.aiResponseService.generateResponse({
        message: queueItem.message,
        context,
        systemPrompt,
        apiKey,
      })

      if (!responseResult.success) {
        const errorMessage = `Ошибка AI: ${responseResult.error || "Unknown error"}`
        this.emitError(queueItem.contextId, errorMessage, queueItem.id, queueItem.userMessageId)
        return
      }

      this.appendModelMessage(context, responseResult.response!)
      this.touchContext(context, true)
      this.pruneContextByLimit(context, AI_CHAT_CONFIG.MAX_CONTEXT_MESSAGES)
      this.commitContext(queueItem.contextId, context)

      const responseText = responseResult.response!
      this.emitSuccess(queueItem.contextId, responseText, queueItem.id, queueItem.userMessageId)
    } catch (error) {
      this.logger.e("Error processing queued message:", error)
      const errorMessage = `Ошибка обработки: ${error instanceof Error ? error.message : "Unknown error"}`
      this.emitError(queueItem.contextId, errorMessage, queueItem.id, queueItem.userMessageId)
    } finally {
      this.typingManager.stopTyping(queueItem.contextId)
    }
  }

  private startContextAutoSave(): void {
    this.contextSaveTimer = setInterval(async () => {
      try {
        await this.contextManager.saveAllToCache()
      } catch (error) {
        this.logger.e("Error auto-saving contexts:", error)
      }
    }, AI_CHAT_CONFIG.CONTEXT_SAVE_INTERVAL_MS)
  }

  async initialize(): Promise<void> {
    await this.start()
  }

  public isBotMention(message: string, botUsername?: string, replyToBotMessage?: boolean): boolean {
    return this.messageProcessor.isBotMention(message, botUsername, replyToBotMessage)
  }

  // Подписка на EventBus (опционально)
  public setupEventBusListeners(eventBus?: EventBus): void {
    if (!eventBus)
      return
    // AIChatService первый, пытается "забрать" упоминания бота
    eventBus.onMessageGroupOrdered(async (context: any) => {
      try {
        const { from, text, chat } = context
        if (!from || !text || !chat)
          return false
        const botInfo = await this.dependencies.actions?.getBotInfo?.()
        const replyFromId = context.replyMessage?.from?.id
        const isReplyToBotMessage = !!botInfo?.id && replyFromId === botInfo?.id
        const isMention = this.isBotMention(text, botInfo?.username, isReplyToBotMessage)
        if (!isMention)
          return false
        this.processMessage(from.id, chat.id, text, from.username, from.firstName, context.id)
        return true // поглощаем событие
      } catch (error) {
        this.logger.e("AIChatService EventBus handler error:", error)
        return false
      }
    }, 100)
  }
}
