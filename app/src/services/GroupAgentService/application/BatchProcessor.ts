import type { MessageBuffer } from "./MessageBuffer.js"
import type { DecisionOrchestrator } from "./DecisionOrchestrator.js"
import type { ActionsBuilder } from "./ActionsBuilder.js"
import type { AIProviderPort } from "../ports/AIProviderPort.js"
import type { StateStorePort } from "../ports/StateStorePort.js"
import type { EventBusPort } from "../ports/EventBusPort.js"
import type { ChatConfigPort } from "../ports/ChatConfigPort.js"
import type { BatchClassificationResult, StoredChatHistory, StoredHistoryEntry } from "../domain/Batch.js"
import type { AgentResponseDecision, ModerationDecision } from "../domain/Decision.js"
import type { PromptSpec } from "../domain/PromptContract.js"
import type { ReviewRequestBuilder } from "./ReviewRequestBuilder.js"
import type { ModerationReviewManager } from "./ModerationReviewManager.js"
import type { RetryPolicy } from "./RetryPolicy.js"
import type { ContextBuilderPort } from "../ports/ContextBuilderPort.js"
import type { HistoryReducerPort } from "../ports/HistoryReducerPort.js"
import type { ResponseParserPort } from "../ports/ResponseParserPort.js"
import type { PromptAssembler } from "./PromptAssembler.js"
import type { AdminMentionsPort } from "../ports/AdminMentionsPort.js"
import { Logger } from "../../../helpers/Logger.js"

export interface BatchProcessorConfig {
  batchIntervalMs: number
  maxBatchSize: number
  promptMaxChars: number
}

export interface PromptSpecProvider {
  getSpec: (chatId: number) => Promise<PromptSpec>
}

interface Dependencies {
  buffer: MessageBuffer
  aiProvider: AIProviderPort
  stateStore: StateStorePort
  decisionOrchestrator: DecisionOrchestrator
  actionsBuilder: ActionsBuilder
  eventBus: EventBusPort
  chatConfig: ChatConfigPort
  promptSpecProvider: PromptSpecProvider
  reviewRequestBuilder: ReviewRequestBuilder
  reviewManager: ModerationReviewManager
  retryPolicy: RetryPolicy
  contextBuilder: ContextBuilderPort
  historyReducer: HistoryReducerPort
  promptAssembler: PromptAssembler
  responseParser: ResponseParserPort
  adminMentions: AdminMentionsPort
}

export class BatchProcessor {
  private readonly config: BatchProcessorConfig
  private readonly deps: Dependencies
  private readonly logger = new Logger("BatchProcessor")
  private timer?: NodeJS.Timeout
  private processingChats: Set<number> = new Set()

  constructor(config: BatchProcessorConfig, deps: Dependencies) {
    this.config = config
    this.deps = deps
  }

  async start(): Promise<void> {
    if (this.timer) {
      return
    }
    this.timer = setInterval(() => {
      void this.runCycle()
    }, this.config.batchIntervalMs)
  }

  async stop(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = undefined
    }
  }

  private async runCycle(): Promise<void> {
    this.logger.d("Check messages")
    const chatIds = this.deps.buffer.listChatIds()
    for (const chatId of chatIds) {
      this.logger.d("Messages found for chatId", chatId)
      if (this.processingChats.has(chatId)) {
        this.logger.d("Skip chatId", chatId)
        continue
      }
      try {
        this.processingChats.add(chatId)
        await this.processChat(chatId)
      } catch {
        // Ошибки намеренно не пробрасываем, чтобы не останавливать цикл
      } finally {
        this.processingChats.delete(chatId)
      }
    }
  }

  private async processChat(chatId: number): Promise<void> {
    this.logger.d("Processing chatId", chatId)
    const pending = this.deps.buffer.getPendingMessages(chatId)

    if (pending.length === 0) {
      return
    }

    const config = await this.deps.chatConfig.getChatConfig(chatId)
    if (!config?.groupAgentEnabled) {
      if (pending.length > 0) {
        const messageIds = pending.map(message => message.messageId)
        this.deps.buffer.remove(chatId, messageIds)
      }
      return
    }

    const toProcess = pending.slice(0, this.config.maxBatchSize)
    this.logger.d("Messages to process", toProcess.length)

    if (toProcess.length === 0) {
      return
    }

    const messageIds = toProcess.map(message => message.messageId)

    // Очищаем буфер сразу после проверки конфигурации, чтобы не терять сообщения при выключенном агенте
    this.deps.buffer.remove(chatId, messageIds)

    await this.deps.eventBus.emitTypingStarted({ chatId })
    try {
      const history = await this.deps.stateStore.loadHistory(chatId)
      const historyEntries = history?.entries ?? []
      const promptSpec = await this.deps.promptSpecProvider.getSpec(chatId)

      this.logger.d("History entries", historyEntries.length)
      this.logger.d("Last history entry:", historyEntries[historyEntries.length - 1])

      const context = await this.deps.contextBuilder.buildContext({
        chatId,
        messages: toProcess,
        history: historyEntries,
      })

      const basePrompt = this.deps.promptAssembler.buildPrompt({
        spec: promptSpec,
        context,
        history: [],
        messages: toProcess,
      })

      const budget = this.config.promptMaxChars - basePrompt.length
      const reducedHistory = this.deps.historyReducer.reduce(historyEntries, budget)

      const prompt = this.deps.promptAssembler.buildPrompt({
        spec: promptSpec,
        context,
        history: reducedHistory,
        messages: toProcess,
      })

      const allowedMessageIds = new Set(toProcess.map(message => message.messageId))

      const classification = await this.classifyWithRetry({
        chatId,
        prompt,
        allowedMessageIds,
      })

      this.logger.d("Classification result", classification)

      const resolutions = this.deps.decisionOrchestrator.buildResolutions(toProcess, classification)
      const moderationDecisions = resolutions.flatMap(resolution => resolution.moderationActions)
      const responseDecisions = resolutions
        .map(resolution => resolution.response ?? null)
        .filter((decision): decision is AgentResponseDecision => decision !== null)

      const adminMentions = await this.deps.adminMentions.getAdminMentions(chatId)
      const reviewRequests = this.deps.reviewRequestBuilder.build(resolutions, adminMentions)
      const reviewDecisionKeys = new Set(
        reviewRequests.map(request => this.decisionKey(request.decision)),
      )
      const immediateDecisions = moderationDecisions.filter(
        decision => !reviewDecisionKeys.has(this.decisionKey(decision)),
      )

      const moderationEvent = this.deps.actionsBuilder.buildModerationEvent(chatId, immediateDecisions)
      const responseEvent = this.deps.actionsBuilder.buildResponseEvent(responseDecisions)

      if (responseEvent) {
        await this.deps.eventBus.emitAgentResponse(responseEvent)
      }

      if (moderationEvent) {
        await this.deps.eventBus.emitModerationAction(moderationEvent)
      }

      if (reviewRequests.length > 0) {
        await this.deps.reviewManager.enqueueRequests(reviewRequests)
      }

      await this.persistHistory(chatId, history, resolutions)
    } finally {
      await this.deps.eventBus.emitTypingStopped({ chatId })
    }
  }

  private async classifyWithRetry(input: {
    chatId: number
    prompt: string
    allowedMessageIds: Set<number>
  }): Promise<BatchClassificationResult> {
    let attempt = 0
    while (true) {
      try {
        this.logger.d("Classifying batch:", { chatId: input.chatId })

        const aiResult = await this.deps.aiProvider.classifyBatch({
          chatId: input.chatId,
          prompt: input.prompt,
        })

        this.logger.d("AI result:", aiResult.text)

        if (!aiResult.text) {
          return { results: [], usage: aiResult.usage }
        }

        const parsed = this.deps.responseParser.parse({
          text: aiResult.text,
          allowedMessageIds: input.allowedMessageIds,
        })

        const merged: BatchClassificationResult = {
          ...parsed,
          usage: aiResult.usage,
        }
        return merged
      } catch (error) {
        const decision = this.deps.retryPolicy.decide({ attempt, error })
        if (!decision.shouldRetry) {
          return { results: [] }
        }

        if (decision.delayMs > 0) {
          await this.delay(decision.delayMs)
        }
        attempt += 1
      }
    }
  }

  private async delay(ms: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, ms))
  }

  private decisionKey(decision: ModerationDecision): string {
    const parts = [
      decision.messageId,
      decision.userId,
      decision.action,
      decision.durationMinutes ?? "",
      decision.targetMessageId ?? "",
    ]
    return parts.join(":")
  }

  private async persistHistory(
    chatId: number,
    history: StoredChatHistory | null,
    resolutions: NonNullable<ReturnType<DecisionOrchestrator["buildResolutions"]>>,
  ): Promise<void> {
    const baseEntries = history?.entries ?? []

    const newEntries: StoredHistoryEntry[] = []
    for (const resolution of resolutions) {
      const message = resolution.message
      if (!message) {
        continue
      }

      const actions = resolution.moderationActions.map(action => action.action)
      if (
        actions.length === 0
        && resolution.classification.moderationAction
        && resolution.classification.moderationAction !== "none"
      ) {
        actions.push(resolution.classification.moderationAction)
      }

      const responseText = resolution.response?.text ?? resolution.classification.responseText

      newEntries.push({
        message,
        sender: "user",
        decision: {
          classification: resolution.classification.classification.type,
          requiresResponse: resolution.classification.classification.requiresResponse,
          actions,
          responseText: responseText || undefined,
          targetUserId: resolution.classification.targetUserId,
          targetMessageId: resolution.classification.targetMessageId,
          durationMinutes: resolution.classification.durationMinutes,
        },
        timestamp: message.timestamp,
      })

      if (responseText) {
        newEntries.push({
          sender: "bot",
          message: {
            chatId: message.chatId,
            userId: 0,
            messageId: message.messageId,
            text: responseText,
            timestamp: Date.now(),
            isAdmin: false,
            replyToMessageId: message.messageId,
            replyToUserId: message.userId,
          },
          timestamp: Date.now(),
        })
      }
    }

    const merged = [...baseEntries, ...newEntries]
    const reduced = this.deps.historyReducer.reduce(merged, this.config.promptMaxChars)
    await this.deps.stateStore.saveHistory({
      chatId,
      entries: reduced,
    })
  }
}
