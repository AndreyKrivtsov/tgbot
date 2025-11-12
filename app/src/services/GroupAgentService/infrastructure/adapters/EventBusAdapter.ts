import type { EventBus } from "../../../core/EventBus.js"
import type {
  EventBusPort,
  GroupAgentModerationEvent,
  GroupAgentResponseEvent,
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
}


