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
