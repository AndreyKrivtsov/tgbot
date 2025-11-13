import type { MessageBuffer } from "./MessageBuffer.js"
import type { DecisionOrchestrator } from "./DecisionOrchestrator.js"
import type { ActionsBuilder } from "./ActionsBuilder.js"
import type { AIProviderPort } from "../ports/AIProviderPort.js"
import type { StateStorePort } from "../ports/StateStorePort.js"
import type { EventBusPort } from "../ports/EventBusPort.js"
import type { ChatConfigPort } from "../ports/ChatConfigPort.js"
import type {
  AgentInstructions,
  BatchUsageMetadata,
  ChatHistory,
  HistoryEntry,
  ModerationDecision,
} from "../domain/types.js"
import { formatMessageForAI } from "../domain/MessageFormatter.js"
import type { ReviewRequestBuilder } from "./ReviewRequestBuilder.js"
import type { ModerationReviewManager } from "./ModerationReviewManager.js"

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
}

export class BatchProcessor {
  private readonly config: BatchProcessorConfig
  private readonly deps: Dependencies
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
    console.log("[GroupAgentService] runCycle started")
    const chatIds = this.deps.buffer.listChatIds()
    for (const chatId of chatIds) {
      console.log("[GroupAgentService] processing chatId:", chatId)
      if (this.processingChats.has(chatId)) {
        console.log("[GroupAgentService] chat is already processing, skip:", chatId)
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
    console.log("[GroupAgentService] runCycle finished")
  }

  private async processChat(chatId: number): Promise<void> {
    console.log("[GroupAgentService] processing chatId:", chatId)
    const pending = this.deps.buffer.getPendingMessages(chatId)
    console.log("[GroupAgentService] pending messages:", pending.length)
    if (pending.length === 0) {
      return
    }

    const config = await this.deps.chatConfig.getChatConfig(chatId)
    if (!config?.groupAgentEnabled) {
      return
    }

    const toProcess = pending.slice(0, this.config.maxBatchSize)
    console.log("[GroupAgentService] toProcess messages:", toProcess.length)

    const messageIds = toProcess.map(message => message.messageId)

    // Очищаем буфер сразу после проверки конфигурации, чтобы не терять сообщения при выключенном агенте
    this.deps.buffer.remove(chatId, messageIds)

    const history = await this.deps.stateStore.loadHistory(chatId)
    const historyEntries = history?.entries ?? []
    const instructions = await this.deps.instructionsProvider.getInstructions(chatId)

    const classification = await this.deps.aiProvider.classifyBatch({
      chatId,
      history: historyEntries,
      messages: toProcess,
      instructions,
    })

    if (!classification) {
      return
    }

    console.log("[GroupAgentService] classification:", classification)

    const resolutions = this.deps.decisionOrchestrator.buildResolutions(toProcess, classification)
    const moderationDecisions = resolutions.flatMap(resolution => resolution.moderationActions)
    const responseDecision = resolutions.find(resolution => resolution.response)?.response ?? null

    const reviewRequests = this.deps.reviewRequestBuilder.build(resolutions)
    const reviewDecisionKeys = new Set(
      reviewRequests.map(request => this.decisionKey(request.decision)),
    )
    const immediateDecisions = moderationDecisions.filter(
      decision => !reviewDecisionKeys.has(this.decisionKey(decision)),
    )

    const moderationEvent = this.deps.actionsBuilder.buildModerationEvent(chatId, immediateDecisions)
    const responseEvent = this.deps.actionsBuilder.buildResponseEvent(responseDecision)

    if (moderationEvent) {
      await this.deps.eventBus.emitModerationAction(moderationEvent)
    }

    if (responseEvent) {
      await this.deps.eventBus.emitAgentResponse(responseEvent)
    }

    if (reviewRequests.length > 0) {
      await this.deps.reviewManager.enqueueRequests(reviewRequests)
    }

    await this.persistHistory(chatId, history, resolutions, classification.usage)
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
    const baseEntries = this.applyHistoryTrim(existingEntries, usage)

    const newEntries: HistoryEntry[] = []
    for (const resolution of resolutions) {
      const message = resolution.message
      if (!message) {
        continue
      }
      newEntries.push({
        message: formatMessageForAI(message),
        result: {
          classification: resolution.classification.classification.type,
          moderationAction: resolution.classification.moderationAction,
          responseText: resolution.classification.responseText,
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
    entries: HistoryEntry[],
    usage?: BatchUsageMetadata,
  ): HistoryEntry[] {
    const promptTokens = usage?.promptTokens
    if (!promptTokens || promptTokens < this.config.historyTrimTokenThreshold) {
      return entries
    }

    if (entries.length <= 1) {
      return entries
    }

    const keepCount = Math.max(1, Math.ceil(entries.length / 2))
    const trimmed = entries.slice(-keepCount)
    return trimmed
  }
}
