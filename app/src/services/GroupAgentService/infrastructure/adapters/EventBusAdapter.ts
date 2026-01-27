import type { EventBus } from "../../../../core/EventBus.js"
import type {
  EventBusPort,
  GroupAgentModerationEvent,
  GroupAgentResponseEvent,
  GroupAgentReviewPromptEvent,
  GroupAgentReviewResolvedEvent,
} from "../../ports/EventBusPort.js"

export class EventBusAdapter implements EventBusPort {
  private readonly eventBus: EventBus

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus
  }

  emitModerationAction(event: GroupAgentModerationEvent): Promise<void> {
    return this.eventBus.emitGroupAgentModerationAction(event)
  }

  emitAgentResponse(event: GroupAgentResponseEvent): Promise<void> {
    return this.eventBus.emitGroupAgentResponse(event)
  }

  emitReviewPrompt(event: GroupAgentReviewPromptEvent): Promise<void> {
    return this.eventBus.emitGroupAgentReviewPrompt(event)
  }

  emitReviewResolved(event: GroupAgentReviewResolvedEvent): Promise<void> {
    return this.eventBus.emitGroupAgentReviewResolved(event)
  }

  emitReviewDeletePrompt(event: { chatId: number, messageId: number }): Promise<void> {
    return this.eventBus.emitGroupAgentReviewDeletePrompt(event)
  }

  emitReviewDisablePrompt(event: { chatId: number, messageId: number }): Promise<void> {
    return this.eventBus.emitGroupAgentReviewDisablePrompt(event)
  }
}