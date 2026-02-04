// Types for events are defined locally for the bus; cross-module domain types live in ../types/events.ts

/**
 * Константы событий для централизованного управления
 */
export const EVENTS = {
  // События сообщений
  MESSAGE_GROUP: "message.group",
  MESSAGE_PRIVATE: "message.private",

  // События модерации
  MODERATION_BATCH_RESULT: "moderation.batchResult",

  // События антиспама
  SPAM_DETECTED: "spam.detected",

  // События капчи
  CAPTCHA_PASSED: "captcha.passed",
  CAPTCHA_FAILED: "captcha.failed",
  CAPTCHA_MESSAGE_SENT: "captcha.messageSent",
  NEW_MEMBER: "member.new",
  MEMBER_JOINED: "member.joined",
  MEMBER_LEFT: "member.left",
  CHAT_MEMBER_UPDATED: "member.updated",

  // События AI
  AI_RESPONSE: "ai.response",
  GROUP_AGENT_MODERATION_ACTION: "group_agent.moderationAction",
  GROUP_AGENT_RESPONSE: "group_agent.response",
  GROUP_AGENT_TYPING_STARTED: "group_agent.typing.started",
  GROUP_AGENT_TYPING_STOPPED: "group_agent.typing.stopped",
  GROUP_AGENT_REVIEW_PROMPT: "group_agent.review.prompt",
  GROUP_AGENT_REVIEW_PROMPT_SENT: "group_agent.review.promptSent",
  GROUP_AGENT_REVIEW_DECISION: "group_agent.review.decision",
  GROUP_AGENT_REVIEW_RESOLVED: "group_agent.review.resolved",
  GROUP_AGENT_REVIEW_DELETE_PROMPT: "group_agent.review.deletePrompt",
  GROUP_AGENT_REVIEW_DISABLE_PROMPT: "group_agent.review.disablePrompt",

  // Команды от пользователей (через CommandHandler)
  COMMAND_REGISTER: "command.register",
  COMMAND_UNREGISTER: "command.unregister",
  COMMAND_BAN: "command.ban",
  COMMAND_UNBAN: "command.unban",
  COMMAND_MUTE: "command.mute",
  COMMAND_UNMUTE: "command.unmute",
  COMMAND_ULTRON_TOGGLE: "command.ultron.toggle",
  COMMAND_ADD_ALTRON_KEY: "command.ultron.addKey",
  COMMAND_CLEAR_HISTORY: "command.clearHistory",
} as const

/**
 * Типы данных для событий
 */
export interface MessageReceivedEvent {
  from: {
    id: number
    username?: string
    firstName: string
  }
  chat: {
    id: number
    type: string
  }
  text: string
  id: number
  replyMessage?: any
}

export interface ModerationBatchResultEvent {
  chatId: number
  violations: Array<{
    messageId: number
    reason: string
    action: "delete" | "warn" | "mute" | "kick" | "ban"
  }>
  messages?: Array<{
    id: number
    userId: number
  }>
}

// ===================== Telegram Actions =====================
export type TelegramActionType =
  | "unrestrict"
  | "restrict"
  | "ban"
  | "unban"
  | "kick"
  | "deleteMessage"
  | "sendMessage"

export interface TelegramAction {
  type: TelegramActionType
  params: Record<string, any>
}

// ===================== Event Interfaces =====================
export interface SpamDetectedEvent {
  chatId: number
  userId: number
  messageId: number
  username?: string
  firstName: string
  spamCount: number
  actions: TelegramAction[]
}

export interface CaptchaPassedEvent {
  chatId: number
  userId: number
  username?: string
  firstName?: string
  actions: TelegramAction[]
}

export interface CaptchaFailedEvent {
  chatId: number
  userId: number
  username?: string
  firstName?: string
  reason: "timeout" | "wrong_answer"
  actions: TelegramAction[]
}

export interface CaptchaChallengeEvent {
  chatId: number
  userId: number
  username?: string
  firstName: string
  question: number[]
  options: number[]
  correctAnswer: number
  actions: TelegramAction[]
}

export interface CaptchaMessageSentEvent {
  chatId: number
  userId: number
  messageId: number
}

export interface AIResponseEvent {
  chatId: number
  text: string
  replyToMessageId?: number
  isError?: boolean
  actions: TelegramAction[]
}

export type GroupAgentModerationAction =
  | { type: "deleteMessage", messageId: number, reason?: string }
  | { type: "warn", userId: number, reason: string }
  | { type: "mute", userId: number, duration: number, reason: string }
  | { type: "unmute", userId: number, reason?: string }
  | { type: "kick", userId: number, reason: string }
  | { type: "ban", userId: number, reason: string }
  | { type: "unban", userId: number, reason?: string }

export interface GroupAgentModerationEvent {
  chatId: number
  actions: GroupAgentModerationAction[]
}

export interface GroupAgentResponseEvent {
  chatId: number
  actions: Array<{
    type: "sendMessage"
    text: string
    replyToMessageId?: number
  }>
}

export interface GroupAgentTypingEvent {
  chatId: number
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

export interface NewMemberEvent {
  chatId: number
  userId: number
  username?: string
  firstName?: string
}

// Member precise events
export interface MemberJoinedEvent { chatId: number, userId: number, username?: string, firstName?: string }
export interface MemberLeftEvent { chatId: number, userId: number }
export interface ChatMemberUpdatedEvent { chatId: number, oldStatus: string, newStatus: string, userId: number, username?: string }

// Command payloads
export interface BaseCommand { actorId: number, chatId: number, messageId?: number }
export interface RegisterGroupCommand extends BaseCommand {
  actorUsername?: string
  chatTitle?: string
}
export interface UnregisterGroupCommand extends BaseCommand {
  actorUsername?: string
}
export interface BanUserCommand extends BaseCommand {
  target: { userId?: number, username?: string }
  reason?: string
  actorUsername?: string
}
export interface UnbanUserCommand extends BaseCommand {
  target: { userId?: number, username?: string }
  actorUsername?: string
}
export interface MuteUserCommand extends BaseCommand {
  target: { userId?: number, username?: string }
  actorUsername?: string
}
export interface UnmuteUserCommand extends BaseCommand {
  target: { userId?: number, username?: string }
  actorUsername?: string
}
export interface UltronToggleCommand extends BaseCommand {
  targetChat?: { id?: number, username?: string }
  enabled: boolean
  actorUsername?: string
}
export interface AddAltronKeyCommand extends BaseCommand {
  targetChat: { username: string }
  apiKey: string
  actorUsername?: string
}
export interface ClearHistoryCommand extends BaseCommand {
  targetChatId?: number
  targetProvided?: boolean
  actorUsername?: string
}

/**
 * Типизированный EventBus для медиации событий между сервисами
 */
export class EventBus {
  private listeners: Map<string, ((data: any) => Promise<void>)[]> = new Map()
  private orderedListeners: Map<string, { priority: number, handler: (data: any) => Promise<boolean | void> }[]> = new Map()

  /**
   * Подписка на событие с типизацией
   */
  on<T = any>(event: string, handler: (data: T) => Promise<void>): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, [])
    }
    this.listeners.get(event)!.push(handler as any)
  }

  /**
   * Отправка события с типизацией
   */
  async emit<T = any>(event: string, data: T): Promise<void> {
    const handlers = this.listeners.get(event) || []
    // Используем Promise.allSettled вместо Promise.all для обработки ошибок
    await Promise.allSettled(handlers.map(handler => handler(data)))
  }

  /**
   * Регистрация упорядоченного слушателя с приоритетом.
   * Возврат true из handler означает "событие поглощено" и дальнейшие слушатели вызваны не будут.
   */
  onOrdered<T = any>(event: string, handler: (data: T) => Promise<boolean | void>, priority: number = 0): void {
    if (!this.orderedListeners.has(event)) {
      this.orderedListeners.set(event, [])
    }
    const arr = this.orderedListeners.get(event)!
    arr.push({ priority, handler: handler as any })
    // Сортируем по убыванию приоритета, чтобы более высокие шли первыми
    arr.sort((a, b) => b.priority - a.priority)
  }

  /**
   * Последовательная доставка события упорядоченным слушателям с коротким замыканием.
   */
  async emitOrdered<T = any>(event: string, data: T): Promise<void> {
    const arr = this.orderedListeners.get(event) || []
    for (const { handler } of arr) {
      try {
        const consumed = await handler(data)
        if (consumed === true) {
          break
        }
      } catch {
        // Ошибку проглатываем, продолжаем к следующему слушателю
        // (логирование на усмотрение вызывающей стороны/слушателя)
        continue
      }
    }
  }

  /**
   * Типизированные методы для конкретных событий
   */

  // События сообщений
  onMessageGroup(handler: (data: MessageReceivedEvent) => Promise<void>): void {
    this.on(EVENTS.MESSAGE_GROUP, handler)
  }

  emitMessageGroup(data: MessageReceivedEvent): Promise<void> {
    return this.emit(EVENTS.MESSAGE_GROUP, data)
  }

  onMessageGroupOrdered(handler: (data: MessageReceivedEvent) => Promise<boolean | void>, priority: number = 0): void {
    this.onOrdered(EVENTS.MESSAGE_GROUP, handler, priority)
  }

  emitMessageGroupOrdered(data: MessageReceivedEvent): Promise<void> {
    return this.emitOrdered(EVENTS.MESSAGE_GROUP, data)
  }

  onMessagePrivate(handler: (data: MessageReceivedEvent) => Promise<void>): void {
    this.on(EVENTS.MESSAGE_PRIVATE, handler)
  }

  emitMessagePrivate(data: MessageReceivedEvent): Promise<void> {
    return this.emit(EVENTS.MESSAGE_PRIVATE, data)
  }

  onMessagePrivateOrdered(handler: (data: MessageReceivedEvent) => Promise<boolean | void>, priority: number = 0): void {
    this.onOrdered(EVENTS.MESSAGE_PRIVATE, handler, priority)
  }

  emitMessagePrivateOrdered(data: MessageReceivedEvent): Promise<void> {
    return this.emitOrdered(EVENTS.MESSAGE_PRIVATE, data)
  }

  // События модерации
  onModerationBatchResult(handler: (data: ModerationBatchResultEvent) => Promise<void>): void {
    this.on(EVENTS.MODERATION_BATCH_RESULT, handler)
  }

  emitModerationBatchResult(data: ModerationBatchResultEvent): Promise<void> {
    return this.emit(EVENTS.MODERATION_BATCH_RESULT, data)
  }

  // События антиспама
  onSpamDetected(handler: (data: SpamDetectedEvent) => Promise<void>): void {
    this.on(EVENTS.SPAM_DETECTED, handler)
  }

  emitSpamDetected(data: SpamDetectedEvent): Promise<void> {
    return this.emit(EVENTS.SPAM_DETECTED, data)
  }

  // События капчи
  onCaptchaPassed(handler: (data: CaptchaPassedEvent) => Promise<void>): void {
    this.on(EVENTS.CAPTCHA_PASSED, handler)
  }

  emitCaptchaPassed(data: CaptchaPassedEvent): Promise<void> {
    return this.emit(EVENTS.CAPTCHA_PASSED, data)
  }

  onCaptchaFailed(handler: (data: CaptchaFailedEvent) => Promise<void>): void {
    this.on(EVENTS.CAPTCHA_FAILED, handler)
  }

  emitCaptchaFailed(data: CaptchaFailedEvent): Promise<void> {
    return this.emit(EVENTS.CAPTCHA_FAILED, data)
  }

  onNewMember(handler: (data: NewMemberEvent) => Promise<void>): void {
    this.on(EVENTS.NEW_MEMBER, handler)
  }

  emitNewMember(data: NewMemberEvent): Promise<void> {
    return this.emit(EVENTS.NEW_MEMBER, data)
  }

  onMemberJoined(handler: (data: MemberJoinedEvent) => Promise<void>): void {
    this.on(EVENTS.MEMBER_JOINED, handler)
  }

  emitMemberJoined(data: MemberJoinedEvent): Promise<void> {
    return this.emit(EVENTS.MEMBER_JOINED, data)
  }

  onMemberLeft(handler: (data: MemberLeftEvent) => Promise<void>): void {
    this.on(EVENTS.MEMBER_LEFT, handler)
  }

  emitMemberLeft(data: MemberLeftEvent): Promise<void> {
    return this.emit(EVENTS.MEMBER_LEFT, data)
  }

  onChatMemberUpdated(handler: (data: ChatMemberUpdatedEvent) => Promise<void>): void {
    this.on(EVENTS.CHAT_MEMBER_UPDATED, handler)
  }

  emitChatMemberUpdated(data: ChatMemberUpdatedEvent): Promise<void> {
    return this.emit(EVENTS.CHAT_MEMBER_UPDATED, data)
  }

  onCaptchaMessageSent(handler: (data: CaptchaMessageSentEvent) => Promise<void>): void {
    this.on(EVENTS.CAPTCHA_MESSAGE_SENT, handler)
  }

  emitCaptchaMessageSent(data: CaptchaMessageSentEvent): Promise<void> {
    return this.emit(EVENTS.CAPTCHA_MESSAGE_SENT, data)
  }

  // События AI
  onAIResponse(handler: (data: AIResponseEvent) => Promise<void>): void {
    this.on(EVENTS.AI_RESPONSE, handler)
  }

  emitAIResponse(data: AIResponseEvent): Promise<void> {
    return this.emit(EVENTS.AI_RESPONSE, data)
  }

  onGroupAgentModerationAction(handler: (data: GroupAgentModerationEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_MODERATION_ACTION, handler)
  }

  emitGroupAgentModerationAction(data: GroupAgentModerationEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_MODERATION_ACTION, data)
  }

  onGroupAgentResponse(handler: (data: GroupAgentResponseEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_RESPONSE, handler)
  }

  emitGroupAgentResponse(data: GroupAgentResponseEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_RESPONSE, data)
  }

  onGroupAgentTypingStarted(handler: (data: GroupAgentTypingEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_TYPING_STARTED, handler)
  }

  emitGroupAgentTypingStarted(data: GroupAgentTypingEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_TYPING_STARTED, data)
  }

  onGroupAgentTypingStopped(handler: (data: GroupAgentTypingEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_TYPING_STOPPED, handler)
  }

  emitGroupAgentTypingStopped(data: GroupAgentTypingEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_TYPING_STOPPED, data)
  }

  onGroupAgentReviewPrompt(handler: (data: GroupAgentReviewPromptEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_REVIEW_PROMPT, handler)
  }

  emitGroupAgentReviewPrompt(data: GroupAgentReviewPromptEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_REVIEW_PROMPT, data)
  }

  onGroupAgentReviewPromptSent(handler: (data: GroupAgentReviewPromptSentEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_REVIEW_PROMPT_SENT, handler)
  }

  emitGroupAgentReviewPromptSent(data: GroupAgentReviewPromptSentEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_REVIEW_PROMPT_SENT, data)
  }

  onGroupAgentReviewDecision(handler: (data: GroupAgentReviewDecisionEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_REVIEW_DECISION, handler)
  }

  emitGroupAgentReviewDecision(data: GroupAgentReviewDecisionEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_REVIEW_DECISION, data)
  }

  onGroupAgentReviewResolved(handler: (data: GroupAgentReviewResolvedEvent) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_REVIEW_RESOLVED, handler)
  }

  emitGroupAgentReviewResolved(data: GroupAgentReviewResolvedEvent): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_REVIEW_RESOLVED, data)
  }

  onGroupAgentReviewDeletePrompt(handler: (data: { chatId: number, messageId: number }) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_REVIEW_DELETE_PROMPT, handler)
  }

  emitGroupAgentReviewDeletePrompt(data: { chatId: number, messageId: number }): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_REVIEW_DELETE_PROMPT, data)
  }

  onGroupAgentReviewDisablePrompt(handler: (data: { chatId: number, messageId: number }) => Promise<void>): void {
    this.on(EVENTS.GROUP_AGENT_REVIEW_DISABLE_PROMPT, handler)
  }

  emitGroupAgentReviewDisablePrompt(data: { chatId: number, messageId: number }): Promise<void> {
    return this.emit(EVENTS.GROUP_AGENT_REVIEW_DISABLE_PROMPT, data)
  }

  // Команды пользователей
  onCommandRegister(handler: (data: RegisterGroupCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_REGISTER, handler)
  }

  emitCommandRegister(data: RegisterGroupCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_REGISTER, data)
  }

  onCommandUnregister(handler: (data: UnregisterGroupCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_UNREGISTER, handler)
  }

  emitCommandUnregister(data: UnregisterGroupCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_UNREGISTER, data)
  }

  onCommandBan(handler: (data: BanUserCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_BAN, handler)
  }

  emitCommandBan(data: BanUserCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_BAN, data)
  }

  onCommandUnban(handler: (data: UnbanUserCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_UNBAN, handler)
  }

  emitCommandUnban(data: UnbanUserCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_UNBAN, data)
  }

  onCommandMute(handler: (data: MuteUserCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_MUTE, handler)
  }

  emitCommandMute(data: MuteUserCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_MUTE, data)
  }

  onCommandUnmute(handler: (data: UnmuteUserCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_UNMUTE, handler)
  }

  emitCommandUnmute(data: UnmuteUserCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_UNMUTE, data)
  }

  onCommandUltronToggle(handler: (data: UltronToggleCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_ULTRON_TOGGLE, handler)
  }

  emitCommandUltronToggle(data: UltronToggleCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_ULTRON_TOGGLE, data)
  }

  onCommandAddAltronKey(handler: (data: AddAltronKeyCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_ADD_ALTRON_KEY, handler)
  }

  emitCommandAddAltronKey(data: AddAltronKeyCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_ADD_ALTRON_KEY, data)
  }

  onCommandClearHistory(handler: (data: ClearHistoryCommand) => Promise<void>): void {
    this.on(EVENTS.COMMAND_CLEAR_HISTORY, handler)
  }

  emitCommandClearHistory(data: ClearHistoryCommand): Promise<void> {
    return this.emit(EVENTS.COMMAND_CLEAR_HISTORY, data)
  }
}
