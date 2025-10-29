/**
 * Базовое событие модерации
 */
export interface ModerationEvent {
  chatId: number
  userId: number
  reason: string
}

/**
 * Событие блокировки пользователя
 */
export interface BanUserEvent extends ModerationEvent {
  duration?: number // секунды, undefined = навсегда
}

/**
 * Событие отключения сообщений пользователя
 */
export interface MuteUserEvent extends ModerationEvent {
  duration: number // секунды
}

/**
 * Событие удаления сообщения
 */
export interface DeleteMessageEvent {
  chatId: number
  messageId: number
  reason: string
}

/**
 * Событие предупреждения пользователя
 */
export interface WarnUserEvent extends ModerationEvent {
  warningText: string
}

// ===================== Domain Commands (from CommandHandler) =====================

export interface BaseCommand {
  actorId: number // кто вызвал команду
  chatId: number // источник команды (чат где введена команда)
  messageId?: number // исходное сообщение (для ответов)
}

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

// ===================== Member Events (from MemberHandler) =====================

export interface MemberJoinedEvent {
  chatId: number
  userId: number
  username?: string
  firstName?: string
}

export interface MemberLeftEvent {
  chatId: number
  userId: number
}

export interface ChatMemberUpdatedEvent {
  chatId: number
  oldStatus: string
  newStatus: string
  userId: number
  username?: string
}
