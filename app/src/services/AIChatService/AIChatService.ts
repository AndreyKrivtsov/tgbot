import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { DatabaseService } from "../DatabaseService/index.js"
import type { RedisService } from "../RedisService/index.js"
import type { EventBus } from "../../core/EventBus.js"
// ChatConfigService удалён: используется ChatSettingsRepositoryAdapter
import { MessageProcessor } from "./MessageProcessor.js"
import { AIResponseService } from "./AIResponseService.js"
import { TypingManager } from "./TypingManager.js"
import { ChatContextManager } from "./ChatContextManager.js"
import type { ChatContext } from "./ChatContextManager.js"
import { ChatQueueManager } from "./ChatQueueManager.js"
import { AdaptiveChatThrottleManager } from "./AdaptiveThrottleManager.js"
import type { MessageQueueItem } from "./MessageQueue.js"
import type { IAIProvider } from "./providers/IAIProvider.js"
import type { AIChatActionsPort, AIChatRepositoryPort, IAIResponseService, IChatConfigService, IMessageProcessor, ITypingManager, ProcessMessageResult } from "./interfaces.js"
import { AI_CHAT_CONFIG } from "../../constants.js"
import { ContextLifecycle } from "./facades/ContextLifecycle.js"
import { ResponseDispatcher } from "./facades/ResponseDispatcher.js"
import { MessagePipeline } from "./MessagePipeline.js"

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

  private chatConfigService: IChatConfigService
  private messageProcessor: IMessageProcessor
  private aiResponseService: IAIResponseService
  private typingManager: ITypingManager
  private contextManager: ChatContextManager
  private contextLifecycle: ContextLifecycle
  private queueManager: ChatQueueManager
  private throttleManager: AdaptiveChatThrottleManager
  private dispatcher: ResponseDispatcher
  private pipeline: MessagePipeline

  private nextMessageId = 1
  private contextSaveTimer?: NodeJS.Timeout
  private processingContexts: Set<string> = new Set()

  public onMessageResponse?: (contextId: string, response: string, messageId: number, userMessageId?: number, isError?: boolean) => void

  public setSendTypingAction(sendTypingAction: (chatId: number) => Promise<void>): void {
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

    // Используем только репозиторийный порт (ChatSettingsRepositoryAdapter)
    if (!dependencies.repository) {
      throw new Error("AIChatService requires repository adapter (ChatSettingsRepositoryAdapter)")
    }
    const repo = dependencies.repository
    this.chatConfigService = {
      loadAllChatSettings: async () => {},
      isAiEnabledForChat: repo.isAiEnabledForChat,
      getApiKeyForChat: repo.getApiKeyForChat,
      getSystemPromptForChat: repo.getSystemPromptForChat,
    } as any

    this.messageProcessor = new MessageProcessor(logger)
    this.aiResponseService = new AIResponseService(logger, aiProvider)
    this.contextManager = new ChatContextManager(dependencies.redis)
    this.contextLifecycle = new ContextLifecycle(this.contextManager, logger)
    this.queueManager = new ChatQueueManager()
    this.throttleManager = throttleManager || new AdaptiveChatThrottleManager(logger)
    this.dispatcher = new ResponseDispatcher(logger, (contextId, response, messageId, userMessageId, isError) => {
      this.onMessageResponse?.(contextId, response, messageId, userMessageId, isError)
    })
    this.pipeline = new MessagePipeline({
      logger,
      contextLifecycle: this.contextLifecycle,
      aiResponseService: this.aiResponseService,
      chatConfigService: this.chatConfigService,
      throttleManager: this.throttleManager,
      dispatcher: this.dispatcher,
    })

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

  private ensureContextShape(context: ChatContext): void {
    if (!Array.isArray(context.messages)) {
      this.logger.e("context.messages is not an array! Восстанавливаю...")
      context.messages = []
    }
  }

  private async processQueuedMessage(queueItem: MessageQueueItem & { apiKey?: string }): Promise<void> {
    try {
      await this.pipeline.run({ queueItem })
    } catch (error) {
      this.logger.e("Error processing queued message:", error)
      const errorMessage = `Ошибка обработки: ${error instanceof Error ? error.message : "Unknown error"}`
      this.dispatcher.emitError(queueItem.contextId, errorMessage, queueItem.id, queueItem.userMessageId)
    } finally {
      this.typingManager.stopTyping(queueItem.contextId)
    }
  }

  private async getOrCreateContext(contextId: string): Promise<ChatContext> {
    let context = this.contextManager.getContext(contextId)
    if (!context) {
      const cachedContext = await this.contextManager.loadFromCache(contextId)
      if (cachedContext) {
        context = cachedContext
        this.contextManager.setContext(contextId, context)
      } else {
        context = this.contextManager.createContext(contextId)
      }
    }
    return context
  }

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
    eventBus.on("message.received", async (context: any) => {
      try {
        const { from, text, chat } = context
        if (!from || !text || !chat)
          return
        // Получаем botInfo через actions порт при необходимости
        const botInfo = await this.dependencies.actions?.getBotInfo?.()
        const isReplyToBotMessage = context.replyMessage?.from?.id === botInfo?.id
        const isMention = this.isBotMention(text, botInfo?.username, isReplyToBotMessage)
        if (!isMention)
          return
        await this.processMessage(from.id, chat.id, text, from.username, from.firstName, context.id)
      } catch (error) {
        this.logger.e("AIChatService EventBus handler error:", error)
      }
    })
  }
}
