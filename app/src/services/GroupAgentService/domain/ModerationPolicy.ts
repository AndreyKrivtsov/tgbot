import type {
  BufferedMessage,
  ClassificationResult,
  ModerationDecision,
} from "./types.js"

export class ModerationPolicy {
  constructor() {}

  evaluate(message: BufferedMessage, result: ClassificationResult): ModerationDecision[] {
    const action = result.moderationAction
    if (!action || action === "none") {
      return []
    }

    if (action === "unmute" || action === "unban") {
      return this.handleRestorationAction(message, result)
    }

    const targetUserId = this.resolveTargetUserId(message, result)
    const targetMessageId = result.targetMessageId ?? message.messageId
    const text = result.responseText?.trim() ?? ""

    switch (action) {
      case "delete":
        return [
          {
            messageId: message.messageId,
            userId: targetUserId,
            action: "delete",
            targetMessageId,
            text,
          },
        ]
      case "warn":
        if (!text) {
          return []
        }
        return [
          {
            messageId: message.messageId,
            userId: targetUserId,
            action: "warn",
            targetMessageId,
            text,
          },
        ]
      case "mute":
        if (!text || typeof result.durationMinutes !== "number" || result.durationMinutes <= 0) {
          return []
        }
        return [
          {
            messageId: message.messageId,
            userId: targetUserId,
            action: "mute",
            targetMessageId,
            durationMinutes: result.durationMinutes,
            text,
          },
        ]
      case "kick":
      case "ban":
        if (!text) {
          return []
        }
        return [
          {
            messageId: message.messageId,
            userId: targetUserId,
            action,
            targetMessageId,
            text,
          },
        ]
      default:
        return []
    }
  }

  private handleRestorationAction(message: BufferedMessage, result: ClassificationResult): ModerationDecision[] {
    const action = result.moderationAction
    if (action !== "unmute" && action !== "unban") {
      return []
    }

    const targetUserId = this.resolveTargetUserId(message, result)
    if (!targetUserId) {
      return []
    }

    return [
      {
        messageId: message.messageId,
        userId: targetUserId,
        action,
        text: result.responseText?.trim() ?? "",
      },
    ]
  }

  private resolveTargetUserId(message: BufferedMessage, result: ClassificationResult): number {
    if (typeof result.targetUserId === "number" && result.targetUserId > 0) {
      return result.targetUserId
    }
    return message.userId
  }
}
