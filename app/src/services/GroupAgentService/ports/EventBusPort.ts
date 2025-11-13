export type ModerationActionDescriptor =
  | { type: "deleteMessage", messageId: number, reason?: string }
  | { type: "warn", userId: number, reason: string }
  | { type: "mute", userId: number, duration: number, reason: string }
  | { type: "unmute", userId: number, reason?: string }
  | { type: "kick", userId: number, reason: string }
  | { type: "ban", userId: number, reason: string }
  | { type: "unban", userId: number, reason?: string }

export interface GroupAgentModerationEvent {
  chatId: number
  actions: ModerationActionDescriptor[]
}

export interface GroupAgentResponseEvent {
  chatId: number
  actions: Array<{
    type: "sendMessage"
    text: string
    replyToMessageId?: number
  }>
}

export interface GroupAgentReviewPromptEvent {
  reviewId: string
  chatId: number
  text: string
  inlineKeyboard: Array<Array<{ text: string, callbackData: string }>>
}

export interface GroupAgentReviewPromptSentEvent {
  reviewId: string
  chatId: number
  messageId: number
}

export interface GroupAgentReviewDecisionEvent {
  reviewId: string
  chatId: number
  moderatorId: number
  action: "approve" | "reject"
  response?: {
    status: "ok" | "error"
    message: string
  }
}

export interface GroupAgentReviewResolvedEvent {
  reviewId: string
  chatId: number
  status: "approved" | "rejected" | "expired"
  moderatorId?: number
}

export interface EventBusPort {
  emitModerationAction: (event: GroupAgentModerationEvent) => Promise<void>
  emitAgentResponse: (event: GroupAgentResponseEvent) => Promise<void>
  emitReviewPrompt: (event: GroupAgentReviewPromptEvent) => Promise<void>
  emitReviewResolved: (event: GroupAgentReviewResolvedEvent) => Promise<void>
  emitReviewDeletePrompt: (event: { chatId: number, messageId: number }) => Promise<void>
  emitReviewDisablePrompt: (event: { chatId: number, messageId: number }) => Promise<void>
}
