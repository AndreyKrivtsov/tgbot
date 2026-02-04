import type { BufferedMessage } from "./Message.js"

export type ClassificationType = "normal" | "violation" | "bot_mention"
export type ModerationActionKind = "none" | "warn" | "delete" | "mute" | "unmute" | "kick" | "ban" | "unban"

export interface ClassificationResult {
  messageId: number
  classification: {
    type: ClassificationType
    requiresResponse: boolean
  }
  moderationAction?: ModerationActionKind
  responseText?: string
  targetUserId?: number
  targetMessageId?: number
  durationMinutes?: number
}

export interface ModerationDecision {
  messageId: number
  userId: number
  action: Exclude<ModerationActionKind, "none">
  durationMinutes?: number
  targetMessageId?: number
  text: string
}

export type ReviewableModerationAction = Extract<ModerationActionKind, "kick" | "ban">

export type ModerationReviewStatus = "pending" | "approved" | "rejected" | "expired"

export function isReviewableAction(action: ModerationActionKind): action is ReviewableModerationAction {
  return action === "kick" || action === "ban"
}

export interface ModerationReviewRequest {
  id: string
  chatId: number
  decision: ModerationDecision
  targetUser: {
    id: number
    username?: string
    firstName?: string
  }
  reason: string
  createdAt: number
  expiresAt: number
  promptText: string
}

export interface ModerationReviewRecord extends ModerationReviewRequest {
  status: ModerationReviewStatus
  promptMessageId?: number
}

export interface AgentResponseDecision {
  messageId: number
  chatId: number
  text: string
  replyToMessageId?: number
}

export interface AgentResolution {
  message: BufferedMessage | null
  classification: ClassificationResult
  moderationActions: ModerationDecision[]
  response?: AgentResponseDecision | null
}
