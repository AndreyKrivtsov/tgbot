import type { AgentResponseDecision, ModerationDecision } from "../domain/Decision.js"
import type {
  GroupAgentModerationEvent,
  GroupAgentResponseEvent,
  ModerationActionDescriptor,
} from "../ports/EventBusPort.js"

function buildModerationAction(decision: ModerationDecision): ModerationActionDescriptor | null {
  switch (decision.action) {
    case "delete":
      return decision.targetMessageId
        ? { type: "deleteMessage", messageId: decision.targetMessageId }
        : null
    case "warn":
      return { type: "warn", userId: decision.userId, reason: decision.text }
    case "mute":
      if (typeof decision.durationMinutes !== "number") {
        return null
      }
      return {
        type: "mute",
        userId: decision.userId,
        reason: decision.text,
        duration: decision.durationMinutes,
      }
    case "unmute":
      return {
        type: "unmute",
        userId: decision.userId,
        reason: decision.text,
      }
    case "kick":
      return { type: "kick", userId: decision.userId, reason: decision.text }
    case "ban":
      return { type: "ban", userId: decision.userId, reason: decision.text }
    case "unban":
      return {
        type: "unban",
        userId: decision.userId,
        reason: decision.text,
      }
    default:
      return null
  }
}

export class ActionsBuilder {
  buildModerationEvent(chatId: number, decisions: ModerationDecision[]): GroupAgentModerationEvent | null {
    const actions = decisions
      .map(buildModerationAction)
      .filter((action): action is ModerationActionDescriptor => action !== null)

    if (actions.length === 0) {
      return null
    }

    return {
      chatId,
      actions,
    }
  }

  buildResponseEvent(decisions: AgentResponseDecision[]): GroupAgentResponseEvent | null {
    if (decisions.length === 0) {
      return null
    }

    const [firstDecision] = decisions
    if (!firstDecision) {
      return null
    }

    return {
      chatId: firstDecision.chatId,
      actions: decisions.map(decision => ({
        type: "sendMessage",
        text: decision.text,
        replyToMessageId: decision.replyToMessageId,
      })),
    }
  }
}
