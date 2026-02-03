import type { IService } from "../../core/Container.js"
import type { AppConfig } from "../../config.js"
import type { ClearHistoryCommand, EventBus, MessageReceivedEvent, TelegramAction } from "../../core/EventBus.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import type { RedisService } from "../RedisService/index.js"
import type { AuthorizationService } from "../AuthorizationService/index.js"
import { GROUP_AGENT_CONFIG } from "../../constants.js"
import type { GroupAgentConfigType } from "../../constants.js"
import { MessageBuffer } from "./application/MessageBuffer.js"
import { BatchProcessor } from "./application/BatchProcessor.js"
import type { PromptSpecProvider } from "./application/BatchProcessor.js"
import { ActionsBuilder } from "./application/ActionsBuilder.js"
import { ModerationPolicy } from "./domain/ModerationPolicy.js"
import { ResponsePolicy } from "./domain/ResponsePolicy.js"
import type { IncomingGroupMessage } from "./domain/Message.js"
import { DecisionOrchestrator } from "./application/DecisionOrchestrator.js"
import { ChatRepositoryAdapter } from "./infrastructure/adapters/ChatRepositoryAdapter.js"
import { RedisStateStoreAdapter } from "./infrastructure/adapters/RedisStateStoreAdapter.js"
import { EventBusAdapter } from "./infrastructure/adapters/EventBusAdapter.js"
import { GeminiAdapter } from "./infrastructure/adapters/GeminiAdapter.js"
import { AdminMentionsAdapter } from "./infrastructure/adapters/AdminMentionsAdapter.js"
import type { ChatConfigPort } from "./ports/ChatConfigPort.js"
import type { EventBusPort } from "./ports/EventBusPort.js"
import type { StateStorePort } from "./ports/StateStorePort.js"
import type { AdminMentionsPort } from "./ports/AdminMentionsPort.js"
import { DEFAULT_PROMPT_SPEC } from "./infrastructure/config/promptSpec.js"
import { ContextBuilder } from "./application/ContextBuilder.js"
import { HistoryReducer } from "./application/HistoryReducer.js"
import { PromptAssembler } from "./application/PromptAssembler.js"
import { HistoryToPromptMapper } from "./application/HistoryToPromptMapper.js"
import { CompactPromptBuilder } from "./infrastructure/prompt/CompactPromptBuilder.js"
import { CompactResponseParser } from "./infrastructure/prompt/CompactResponseParser.js"
import { getMessage } from "../../shared/messages/index.js"

import type { AIProviderPort } from "./ports/AIProviderPort.js"
import type { ReviewStatePort } from "./ports/ReviewStatePort.js"
import { RedisReviewStateAdapter } from "./infrastructure/adapters/RedisReviewStateAdapter.js"
import { ReviewRequestBuilder } from "./application/ReviewRequestBuilder.js"
import { ModerationReviewManager } from "./application/ModerationReviewManager.js"
import { DefaultRetryPolicy } from "./application/RetryPolicy.js"

interface Dependencies {
  eventBus?: EventBus
  chatRepository?: ChatRepository
  redisService?: RedisService
  authorizationService?: AuthorizationService
}

export class GroupAgentService implements IService {
  readonly name = "GroupAgentService"

  private readonly config: AppConfig
  private readonly deps: Dependencies
  private readonly serviceConfig: GroupAgentConfigType

  private messageBuffer: MessageBuffer
  private stateStore?: StateStorePort
  private chatConfigPort?: ChatConfigPort
  private eventBusPort?: EventBusPort
  private batchProcessor?: BatchProcessor
  private aiProvider?: AIProviderPort
  private decisionOrchestrator?: DecisionOrchestrator
  private actionsBuilder?: ActionsBuilder
  private reviewStateStore?: ReviewStatePort
  private reviewRequestBuilder?: ReviewRequestBuilder
  private reviewManager?: ModerationReviewManager
  private adminMentionsPort?: AdminMentionsPort

  private promptSpecProvider: PromptSpecProvider
  private contextBuilder?: ContextBuilder
  private historyReducer?: HistoryReducer
  private promptBuilder?: CompactPromptBuilder
  private promptAssembler?: PromptAssembler
  private historyToPromptMapper?: HistoryToPromptMapper
  private responseParser?: CompactResponseParser

  constructor(config: AppConfig, deps: Dependencies = {}) {
    this.config = config
    this.deps = deps
    this.serviceConfig = GROUP_AGENT_CONFIG
    this.messageBuffer = new MessageBuffer()
    this.promptSpecProvider = {
      getSpec: async (): Promise<typeof DEFAULT_PROMPT_SPEC> => DEFAULT_PROMPT_SPEC,
    }
  }

  async initialize(): Promise<void> {
    if (!this.deps.eventBus || !this.deps.chatRepository || !this.deps.redisService) {
      return
    }

    const chatConfigPort = new ChatRepositoryAdapter(this.deps.chatRepository)
    const stateStore = new RedisStateStoreAdapter(this.deps.redisService)
    const eventBusPort = new EventBusAdapter(this.deps.eventBus)
    const reviewStateStore = new RedisReviewStateAdapter(this.deps.redisService)
    const adminMentionsPort = new AdminMentionsAdapter(this.deps.chatRepository, this.deps.redisService)

    this.chatConfigPort = chatConfigPort
    this.stateStore = stateStore
    this.eventBusPort = eventBusPort
    this.reviewStateStore = reviewStateStore
    this.adminMentionsPort = adminMentionsPort

    const moderationPolicy = new ModerationPolicy()

    const responsePolicy = new ResponsePolicy({
      maxResponseLength: this.serviceConfig.AI_MAX_RESPONSE_LENGTH,
      priorities: ["bot_mention", "normal"],
    })

    this.decisionOrchestrator = new DecisionOrchestrator(moderationPolicy, responsePolicy)
    this.actionsBuilder = new ActionsBuilder()
    this.aiProvider = new GeminiAdapter(chatConfigPort)
    this.reviewRequestBuilder = new ReviewRequestBuilder(this.serviceConfig.REVIEW_TTL_SECONDS)
    this.contextBuilder = new ContextBuilder(chatConfigPort)
    this.historyToPromptMapper = new HistoryToPromptMapper()
    this.historyReducer = new HistoryReducer(
      {
        dedupe: true,
      },
      this.historyToPromptMapper,
    )
    this.promptBuilder = new CompactPromptBuilder()
    this.promptAssembler = new PromptAssembler(this.promptBuilder, this.historyToPromptMapper)
    this.responseParser = new CompactResponseParser()

    if (this.actionsBuilder) {
      this.reviewManager = new ModerationReviewManager({
        stateStore: reviewStateStore,
        eventBus: eventBusPort,
        actionsBuilder: this.actionsBuilder,
      })
    }

    this.deps.eventBus.onMessageGroupOrdered(async (event) => {
      await this.handleMessage(event)
      return false
    }, 5)

    this.deps.eventBus.onGroupAgentReviewPromptSent(async (event) => {
      await this.reviewManager?.handlePromptSent(event)
    })

    this.deps.eventBus.onGroupAgentReviewDecision(async (event) => {
      await this.reviewManager?.handleDecision(event)
    })

    this.deps.eventBus.onCommandClearHistory(async (cmd: ClearHistoryCommand) => {
      await this.handleClearHistory(cmd)
    })
  }

  async start(): Promise<void> {
    if (!this.hasDepsReady()) {
      return
    }

    const stateStore = this.stateStore!
    const aiProvider = this.aiProvider!
    const decisionOrchestrator = this.decisionOrchestrator!
    const actionsBuilder = this.actionsBuilder!
    const eventBusPort = this.eventBusPort!
    const chatConfigPort = this.chatConfigPort!
    const reviewRequestBuilder = this.reviewRequestBuilder!
    const reviewManager = this.reviewManager!
    const retryPolicy = new DefaultRetryPolicy({ maxAttempts: 2, delayMs: 1000 })
    const contextBuilder = this.contextBuilder!
    const historyReducer = this.historyReducer!
    const promptAssembler = this.promptAssembler!
    const responseParser = this.responseParser!
    const adminMentionsPort = this.adminMentionsPort!

    const buffers = await stateStore.loadBuffers()
    this.messageBuffer = new MessageBuffer(buffers)

    this.batchProcessor = new BatchProcessor(
      {
        batchIntervalMs: this.serviceConfig.BATCH_INTERVAL_MS,
        maxBatchSize: this.serviceConfig.MAX_BATCH_SIZE,
        promptMaxChars: this.serviceConfig.PROMPT_MAX_TOKENS * this.serviceConfig.PROMPT_TOKEN_CHAR_RATIO,
      },
      {
        buffer: this.messageBuffer,
        aiProvider,
        stateStore,
        decisionOrchestrator,
        actionsBuilder,
        eventBus: eventBusPort,
        chatConfig: chatConfigPort,
        promptSpecProvider: this.promptSpecProvider,
        reviewRequestBuilder,
        reviewManager,
        retryPolicy,
        contextBuilder,
        historyReducer,
        promptAssembler,
        responseParser,
        adminMentions: adminMentionsPort,
      },
    )

    await this.batchProcessor.start()
  }

  async stop(): Promise<void> {
    if (this.batchProcessor) {
      await this.batchProcessor.stop()
    }

    if (this.stateStore) {
      await this.stateStore.saveBuffers(this.messageBuffer.toState())
    }
  }

  async dispose(): Promise<void> {
    await this.stop()
  }

  isHealthy(): boolean {
    return true
  }

  private async handleMessage(event: MessageReceivedEvent): Promise<void> {
    if (!event.chat?.id || !event.from?.id || !event.text) {
      return
    }

    if (!this.chatConfigPort) {
      return
    }

    const config = await this.chatConfigPort.getChatConfig(event.chat.id)
    if (!config?.groupAgentEnabled) {
      return
    }

    const buffered = await this.buildBufferedMessage(event)
    if (!buffered) {
      return
    }

    this.messageBuffer.addMessage(buffered)
  }

  private async handleClearHistory(cmd: ClearHistoryCommand): Promise<void> {
    if (!this.deps.eventBus || !this.stateStore) {
      return
    }

    const { actorId, chatId, messageId, targetChatId, targetProvided, actorUsername } = cmd
    const authorization = this.deps.authorizationService
    if (!authorization) {
      return
    }

    const hasTarget = Boolean(targetProvided)
    const isValidTarget = typeof targetChatId === "number" && Number.isInteger(targetChatId) && targetChatId !== 0

    if (hasTarget && !isValidTarget) {
      await this.sendCommandMessage(chatId, getMessage("clear_history_usage"), messageId)
      return
    }

    const isPrivate = chatId > 0
    if (isPrivate) {
      if (!hasTarget) {
        await this.sendCommandMessage(chatId, getMessage("clear_history_private_usage"), messageId)
        return
      }

      if (!authorization.isSuperAdmin(actorUsername)) {
        await this.sendCommandMessage(chatId, getMessage("clear_history_no_permission"), messageId)
        return
      }

      await this.clearChatState(targetChatId!, chatId, messageId)
      return
    }

    if (hasTarget) {
      if (!authorization.isSuperAdmin(actorUsername)) {
        await this.sendCommandMessage(chatId, getMessage("clear_history_no_permission"), messageId)
        return
      }

      await this.clearChatState(targetChatId!, chatId, messageId)
      return
    }

    const authResult = await authorization.checkGroupAdmin(chatId, actorId, actorUsername)
    if (!authResult.authorized) {
      const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
      await this.sendCommandMessage(chatId, getMessage(reasonKey), messageId)
      return
    }

    await this.clearChatState(chatId, chatId, messageId)
  }

  private async clearChatState(targetChatId: number, responseChatId: number, messageId?: number): Promise<void> {
    this.messageBuffer.clear(targetChatId)
    await this.stateStore?.clearBuffer(targetChatId)
    await this.stateStore?.clearHistory(targetChatId)
    await this.sendCommandMessage(responseChatId, getMessage("clear_history_success", { chatId: targetChatId }), messageId)

    console.info(`[GroupAgentService] Chat state cleared for chat ${targetChatId}`)
  }

  private async sendCommandMessage(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    if (!this.deps.eventBus) {
      return
    }

    const actions: TelegramAction[] = []

    if (replyToMessageId) {
      actions.push({
        type: "deleteMessage",
        params: { messageId: replyToMessageId },
      })
    }

    actions.push({
      type: "sendMessage",
      params: {
        text,
      },
    })

    await this.deps.eventBus.emitAIResponse({
      chatId,
      text,
      actions,
    })
  }

  private async buildBufferedMessage(event: MessageReceivedEvent): Promise<IncomingGroupMessage | null> {
    if (!this.chatConfigPort) {
      return null
    }

    const chatId = event.chat.id
    const userId = event.from.id

    const isAdmin = await this.chatConfigPort.isAdmin(chatId, userId)
    const reply = event.replyMessage as any

    const message: IncomingGroupMessage = {
      chatId,
      userId,
      messageId: event.id,
      text: event.text,
      timestamp: Date.now(),
      username: event.from.username,
      firstName: event.from.firstName,
      isAdmin,
      replyToMessageId: reply?.messageId ?? reply?.id ?? undefined,
      replyToUserId: reply?.from?.id ?? undefined,
    }

    return message
  }

  private hasDepsReady(): boolean {
    return Boolean(
      this.stateStore
      && this.eventBusPort
      && this.chatConfigPort
      && this.decisionOrchestrator
      && this.actionsBuilder
      && this.aiProvider
      && this.reviewManager
      && this.reviewRequestBuilder
      && this.contextBuilder
      && this.historyReducer
      && this.promptBuilder
      && this.promptAssembler
      && this.historyToPromptMapper
      && this.responseParser
      && this.adminMentionsPort,
    )
  }
}
