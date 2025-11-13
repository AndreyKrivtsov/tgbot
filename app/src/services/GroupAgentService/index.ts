import type { IService } from "../../core/Container.js"
import type { AppConfig } from "../../config.js"
import type { EventBus, MessageReceivedEvent } from "../../core/EventBus.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import type { RedisService } from "../RedisService/index.js"
import { GROUP_AGENT_CONFIG } from "../../constants.js"
import type { GroupAgentConfigType } from "../../constants.js"
import { MessageBuffer } from "./application/MessageBuffer.js"
import { BatchProcessor } from "./application/BatchProcessor.js"
import type { InstructionsProvider } from "./application/BatchProcessor.js"
import { ActionsBuilder } from "./application/ActionsBuilder.js"
import { ModerationPolicy } from "./domain/ModerationPolicy.js"
import { ResponsePolicy } from "./domain/ResponsePolicy.js"
import type { AgentInstructions, IncomingGroupMessage } from "./domain/types.js"
import { DecisionOrchestrator } from "./application/DecisionOrchestrator.js"
import { ChatRepositoryAdapter } from "./infrastructure/adapters/ChatRepositoryAdapter.js"
import { RedisStateStoreAdapter } from "./infrastructure/adapters/RedisStateStoreAdapter.js"
import { EventBusAdapter } from "./infrastructure/adapters/EventBusAdapter.js"
import { GeminiAdapter } from "./infrastructure/adapters/GeminiAdapter.js"
import type { ChatConfigPort } from "./ports/ChatConfigPort.js"
import type { EventBusPort } from "./ports/EventBusPort.js"
import type { StateStorePort } from "./ports/StateStorePort.js"
import { DEFAULT_AGENT_INSTRUCTIONS } from "./infrastructure/config/defaultInstructions.js"

import type { AIProviderPort } from "./ports/AIProviderPort.js"
import type { ReviewStatePort } from "./ports/ReviewStatePort.js"
import { RedisReviewStateAdapter } from "./infrastructure/adapters/RedisReviewStateAdapter.js"
import { ReviewRequestBuilder } from "./application/ReviewRequestBuilder.js"
import { ModerationReviewManager } from "./application/ModerationReviewManager.js"

interface Dependencies {
  eventBus?: EventBus
  chatRepository?: ChatRepository
  redisService?: RedisService
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

  private instructionsProvider: InstructionsProvider = {
    async getInstructions(): Promise<AgentInstructions> {
      return DEFAULT_AGENT_INSTRUCTIONS
    },
  }

  constructor(config: AppConfig, deps: Dependencies = {}) {
    this.config = config
    this.deps = deps
    this.serviceConfig = GROUP_AGENT_CONFIG
    this.messageBuffer = new MessageBuffer()
  }

  async initialize(): Promise<void> {
    if (!this.deps.eventBus || !this.deps.chatRepository || !this.deps.redisService) {
      return
    }

    const chatConfigPort = new ChatRepositoryAdapter(this.deps.chatRepository)
    const stateStore = new RedisStateStoreAdapter(this.deps.redisService)
    const eventBusPort = new EventBusAdapter(this.deps.eventBus)
    const reviewStateStore = new RedisReviewStateAdapter(this.deps.redisService)

    this.chatConfigPort = chatConfigPort
    this.stateStore = stateStore
    this.eventBusPort = eventBusPort
    this.reviewStateStore = reviewStateStore

    const moderationPolicy = new ModerationPolicy()

    const responsePolicy = new ResponsePolicy({
      maxResponseLength: this.serviceConfig.AI_MAX_RESPONSE_LENGTH,
      priorities: ["bot_mention", "normal"],
    })

    this.decisionOrchestrator = new DecisionOrchestrator(moderationPolicy, responsePolicy)
    this.actionsBuilder = new ActionsBuilder()
    this.aiProvider = new GeminiAdapter(chatConfigPort)
    this.reviewRequestBuilder = new ReviewRequestBuilder(this.serviceConfig.REVIEW_TTL_SECONDS)

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
  }

  async start(): Promise<void> {
    if (!this.hasDepsReady()) {
      return
    }

    const buffers = await this.stateStore.loadBuffers()
    this.messageBuffer = new MessageBuffer(buffers)

    this.batchProcessor = new BatchProcessor(
      {
        batchIntervalMs: this.serviceConfig.BATCH_INTERVAL_MS,
        maxBatchSize: this.serviceConfig.MAX_BATCH_SIZE,
        historyTrimTokenThreshold: this.serviceConfig.HISTORY_PROMPT_TOKEN_THRESHOLD,
      },
      {
        buffer: this.messageBuffer,
        aiProvider: this.aiProvider,
        stateStore: this.stateStore,
        decisionOrchestrator: this.decisionOrchestrator,
        actionsBuilder: this.actionsBuilder,
        eventBus: this.eventBusPort,
        chatConfig: this.chatConfigPort,
        instructionsProvider: this.instructionsProvider,
        reviewRequestBuilder: this.reviewRequestBuilder,
        reviewManager: this.reviewManager,
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

    const buffered = await this.buildBufferedMessage(event)
    if (!buffered) {
      return
    }

    this.messageBuffer.addMessage(buffered)
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
      && this.reviewRequestBuilder,
    )
  }
}
