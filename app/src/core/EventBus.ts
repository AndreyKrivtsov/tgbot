// Types for events are defined locally for the bus; cross-module domain types live in ../types/events.ts

/**
 * Константы событий для централизованного управления
 */
export const EVENTS = {
  // События сообщений
  MESSAGE_RECEIVED: "message.received",

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

  // Команды от пользователей (через CommandHandler)
  COMMAND_REGISTER: "command.register",
  COMMAND_UNREGISTER: "command.unregister",
  COMMAND_BAN: "command.ban",
  COMMAND_UNBAN: "command.unban",
  COMMAND_MUTE: "command.mute",
  COMMAND_UNMUTE: "command.unmute",
  COMMAND_ULTRON_TOGGLE: "command.ultron.toggle",
  COMMAND_ADD_ALTRON_KEY: "command.ultron.addKey",
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

/**
 * Типизированный EventBus для медиации событий между сервисами
 */
export class EventBus {
  private listeners: Map<string, ((data: any) => Promise<void>)[]> = new Map()

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
   * Типизированные методы для конкретных событий
   */

  // События сообщений
  onMessageReceived(handler: (data: MessageReceivedEvent) => Promise<void>): void {
    this.on(EVENTS.MESSAGE_RECEIVED, handler)
  }

  emitMessageReceived(data: MessageReceivedEvent): Promise<void> {
    return this.emit(EVENTS.MESSAGE_RECEIVED, data)
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
}
