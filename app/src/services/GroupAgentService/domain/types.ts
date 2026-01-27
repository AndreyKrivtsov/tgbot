export interface IncomingGroupMessage {
  messageId: number
  chatId: number
  userId: number
  text: string
  timestamp: number
  username?: string
  firstName?: string
  isAdmin?: boolean
  replyToMessageId?: number
  replyToUserId?: number
}

export interface BufferedMessage extends IncomingGroupMessage {
  processed?: boolean
}

export interface FormattedMessage {
  id: number
  chatId: number
  userId: number
  text: string
  timestamp: number
  isAdmin: boolean
  username?: string
  firstName?: string
}

export interface AgentInstructions {
  agent: {
    name: string
    role: string
    character?: string
  }
  responses: {
    triggers: string[]
    rules: string
  }
  moderation: {
    rules: string
  }
  format: {
    message: string
    response: string
  }
  customRules?: string
}

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

export interface BatchUsageMetadata {
  promptTokens?: number
  totalTokens?: number
  modelVersion?: string
}

export interface BatchClassificationResult {
  results: ClassificationResult[]
  usage?: BatchUsageMetadata
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

export interface HistoryEntry {
  message: FormattedMessage
  result: {
    classification: ClassificationType
    requiresResponse: boolean
    actions: ModerationActionKind[]
    responseText?: string
  }
  timestamp: number
}

export interface ChatHistory {
  chatId: number
  entries: HistoryEntry[]
}

export interface BufferState {
  chatId: number
  messages: BufferedMessage[]
  updatedAt: number
}

export interface BatchContext {
  chatId: number
  history: FormattedMessage[]
  messages: BufferedMessage[]
  instructions: AgentInstructions
}
