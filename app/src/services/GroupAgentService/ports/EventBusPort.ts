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

export interface EventBusPort {
  emitModerationAction: (event: GroupAgentModerationEvent) => Promise<void>
  emitAgentResponse: (event: GroupAgentResponseEvent) => Promise<void>
}
