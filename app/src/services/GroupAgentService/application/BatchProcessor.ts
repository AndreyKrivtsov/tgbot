import type { MessageBuffer } from "./MessageBuffer.js"
import type { DecisionOrchestrator } from "./DecisionOrchestrator.js"
import type { ActionsBuilder } from "./ActionsBuilder.js"
import type { AIProviderPort } from "../ports/AIProviderPort.js"
import type { StateStorePort } from "../ports/StateStorePort.js"
import type { EventBusPort } from "../ports/EventBusPort.js"
import type { ChatConfigPort } from "../ports/ChatConfigPort.js"
import type {
  AgentInstructions,
  AgentResponseDecision,
  BatchUsageMetadata,
  ChatHistory,
  HistoryEntry,
  ModerationDecision,
} from "../domain/types.js"
import { formatMessageForAI } from "../domain/MessageFormatter.js"
import type { ReviewRequestBuilder } from "./ReviewRequestBuilder.js"
import type { ModerationReviewManager } from "./ModerationReviewManager.js"
import type { RetryPolicy } from "./RetryPolicy.js"
import { Logger } from "../../../helpers/Logger.js"

export interface BatchProcessorConfig {
  batchIntervalMs: number
  maxBatchSize: number
  historyTrimTokenThreshold: number
}

export interface InstructionsProvider {
  getInstructions: (chatId: number) => Promise<AgentInstructions>
}

interface Dependencies {
  buffer: MessageBuffer
  aiProvider: AIProviderPort
  stateStore: StateStorePort
  decisionOrchestrator: DecisionOrchestrator
  actionsBuilder: ActionsBuilder
  eventBus: EventBusPort
  chatConfig: ChatConfigPort
  instructionsProvider: InstructionsProvider
  reviewRequestBuilder: ReviewRequestBuilder
  reviewManager: ModerationReviewManager
  retryPolicy: RetryPolicy
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
      return
    }

    const toProcess = pending.slice(0, this.config.maxBatchSize)
    this.logger.d("Messages to process", toProcess.length)

    const messageIds = toProcess.map(message => message.messageId)

    // Очищаем буфер сразу после проверки конфигурации, чтобы не терять сообщения при выключенном агенте
    this.deps.buffer.remove(chatId, messageIds)

    const history = await this.deps.stateStore.loadHistory(chatId)
    const historyEntries = history?.entries ?? []
    const instructions = await this.deps.instructionsProvider.getInstructions(chatId)

    this.logger.d("History entries", historyEntries.length)
    this.logger.d("History entry:", historyEntries[0])

    const classification = await this.classifyWithRetry({
      chatId,
      historyEntries,
      messages: toProcess,
      instructions,
    })

    this.logger.d("Classification result", classification)

    const resolutions = this.deps.decisionOrchestrator.buildResolutions(toProcess, classification)
    const moderationDecisions = resolutions.flatMap(resolution => resolution.moderationActions)
    const responseDecisions = resolutions
      .map(resolution => resolution.response ?? null)
      .filter((decision): decision is AgentResponseDecision => decision !== null)

    const reviewRequests = this.deps.reviewRequestBuilder.build(resolutions)
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

    await this.persistHistory(chatId, history, resolutions, classification.usage)
  }

  private async classifyWithRetry(input: {
    chatId: number
    historyEntries: HistoryEntry[]
    messages: Parameters<AIProviderPort["classifyBatch"]>[0]["messages"]
    instructions: AgentInstructions
  }): Promise<Awaited<ReturnType<AIProviderPort["classifyBatch"]>>> {
    let attempt = 0
    while (true) {
      try {
        return await this.deps.aiProvider.classifyBatch({
          chatId: input.chatId,
          history: input.historyEntries,
          messages: input.messages,
          instructions: input.instructions,
        })
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
    history: ChatHistory | null,
    resolutions: NonNullable<ReturnType<DecisionOrchestrator["buildResolutions"]>>,
    usage?: BatchUsageMetadata,
  ): Promise<void> {
    const existingEntries = history?.entries ?? []
    const baseEntries = this.applyHistoryTrim(chatId, existingEntries, usage)

    const newEntries: HistoryEntry[] = []
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
        message: formatMessageForAI(message),
        result: {
          classification: resolution.classification.classification.type,
          requiresResponse: resolution.classification.classification.requiresResponse,
          actions,
          ...(responseText ? { responseText } : {}),
        },
        timestamp: message.timestamp,
      })
    }

    const merged = [...baseEntries, ...newEntries]
    await this.deps.stateStore.saveHistory({
      chatId,
      entries: merged,
    })
  }

  private applyHistoryTrim(
    chatId: number,
    entries: HistoryEntry[],
    usage?: BatchUsageMetadata,
  ): HistoryEntry[] {
    const totalTokens = usage?.totalTokens
    if (!totalTokens || totalTokens < this.config.historyTrimTokenThreshold) {
      return entries
    }

    if (entries.length <= 1) {
      return entries
    }

    const keepCount = Math.max(1, Math.ceil(entries.length / 2))
    const trimmed = entries.slice(-keepCount)

    this.logger.d("Trimmed history:", { chatId, trimmed })

    return trimmed
  }
}
