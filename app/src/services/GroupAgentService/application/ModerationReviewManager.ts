import type {
  ModerationReviewRecord,
  ModerationReviewRequest,
  ModerationReviewStatus,
} from "../domain/types.js"
import type {
  EventBusPort,
  GroupAgentReviewDecisionEvent,
  GroupAgentReviewPromptSentEvent,
} from "../ports/EventBusPort.js"
import type { ReviewStatePort } from "../ports/ReviewStatePort.js"
import type { ActionsBuilder } from "./ActionsBuilder.js"

interface Dependencies {
  stateStore: ReviewStatePort
  eventBus: EventBusPort
  actionsBuilder: ActionsBuilder
}

export class ModerationReviewManager {
  private readonly deps: Dependencies

  constructor(deps: Dependencies) {
    this.deps = deps
  }

  async enqueueRequests(requests: ModerationReviewRequest[]): Promise<void> {
    if (requests.length === 0) {
      return
    }

    for (const request of requests) {
      const record: ModerationReviewRecord = {
        ...request,
        status: "pending",
      }

      await this.deps.stateStore.create(record)

      await this.deps.eventBus.emitReviewPrompt({
        reviewId: record.id,
        chatId: record.chatId,
        text: record.promptText,
        inlineKeyboard: [
          [{ text: "Подтвердить", callbackData: `review:${record.id}:approve` }],
          [{ text: "Отменить", callbackData: `review:${record.id}:reject` }],
        ],
      })
    }
  }

  async handlePromptSent(event: GroupAgentReviewPromptSentEvent): Promise<void> {
    const record = await this.deps.stateStore.get(event.reviewId)
    if (!record) {
      return
    }

    record.promptMessageId = event.messageId
    await this.deps.stateStore.save(record)
  }

  async handleDecision(event: GroupAgentReviewDecisionEvent): Promise<void> {
    const record = await this.deps.stateStore.get(event.reviewId)
    if (!record) {
      event.response = {
        status: "error",
        message: "Запрос подтверждения не найден или срок действия истёк",
      }
      return
    }

    if (record.status !== "pending") {
      event.response = {
        status: "error",
        message: "Запрос уже обработан",
      }
      return
    }

    if (record.expiresAt <= Date.now()) {
      await this.finish(record, "expired", event.moderatorId)
      event.response = {
        status: "error",
        message: "Срок подтверждения истёк",
      }
      return
    }

    if (event.action === "approve") {
      await this.applyDecision(record, event.moderatorId)
      event.response = {
        status: "ok",
        message: "Действие подтверждено",
      }
    } else {
      await this.finish(record, "rejected", event.moderatorId)
      event.response = {
        status: "ok",
        message: "Действие отменено",
      }
    }
  }

  private async applyDecision(record: ModerationReviewRecord, moderatorId: number): Promise<void> {
    const moderationEvent = this.deps.actionsBuilder.buildModerationEvent(record.chatId, [record.decision])
    if (moderationEvent) {
      await this.deps.eventBus.emitModerationAction(moderationEvent)
    }
    await this.finish(record, "approved", moderatorId)
  }

  private async finish(
    record: ModerationReviewRecord,
    status: Exclude<ModerationReviewStatus, "pending">,
    moderatorId?: number,
  ): Promise<void> {
    await this.deps.stateStore.delete(record.id)

    if (record.promptMessageId) {
      if (status === "expired") {
        await this.deps.eventBus.emitReviewDisablePrompt({
          chatId: record.chatId,
          messageId: record.promptMessageId,
        })
      } else {
        await this.deps.eventBus.emitReviewDeletePrompt({
          chatId: record.chatId,
          messageId: record.promptMessageId,
        })
      }
    }

    await this.deps.eventBus.emitReviewResolved({
      reviewId: record.id,
      chatId: record.chatId,
      status,
      ...(typeof moderatorId === "number" ? { moderatorId } : {}),
    })
  }
}
