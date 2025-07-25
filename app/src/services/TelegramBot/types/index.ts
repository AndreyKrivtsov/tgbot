import type { Bot, ChatMemberContext, LeftChatMemberContext, MessageContext, NewChatMembersContext } from "gramio"
import type { TelegramBotService } from "../index.js"
import type { RedisService } from "../../RedisService/index.js"
import type { AIChatServiceRefactored } from "../../AIChatService/AIChatServiceRefactored.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { AntiSpamService } from "../../AntiSpamService/index.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { ChatSettingsService } from "../../ChatSettingsService/index.js"
import type { GramioBot } from "../core/GramioBot.js"
import type { MessageDeletionManager } from "../features/MessageDeletionManager.js"

/**
 * Структура задачи на удаление сообщения
 */
export interface DeletionTask {
  messageId: number
  chatId: number
  deleteAt: number // когда удалить (timestamp)
  retryCount: number // количество попыток (0 или 1)
}

export interface TelegramBotDependencies {
  redisService?: RedisService
  captchaService?: CaptchaService
  antiSpamService?: AntiSpamService
  chatService?: AIChatServiceRefactored
  chatRepository?: ChatRepository
  chatSettingsService?: ChatSettingsService
  messageDeletionManager?: MessageDeletionManager
}

export interface TelegramBotSettings {
  // Настройки капчи
  captchaTimeoutMs: number // Таймаут капчи (по умолчанию 60 сек)
  captchaCheckIntervalMs: number // Интервал проверки истекших капч (по умолчанию 5 сек)

  // Настройки сообщений
  errorMessageDeleteTimeoutMs: number // Таймаут удаления сообщений об ошибках (по умолчанию 60 сек)
  deleteSystemMessages: boolean // Удалять системные сообщения о входе/выходе (по умолчанию true)

  // Настройки банов
  temporaryBanDurationSec: number // Длительность временного бана в секундах (по умолчанию 40 сек)
  autoUnbanDelayMs: number // Задержка автоматического разбана (по умолчанию 5 сек)

  // Настройки антиспама
  maxMessagesForSpamCheck: number // Максимальное количество сообщений для проверки антиспамом (по умолчанию 5)
}

export interface UserMessageCounter {
  userId: number
  messageCount: number
  spamCount: number // Счетчик спам сообщений
  username?: string
  firstName: string
  lastActivity: number
}

// Новые интерфейсы для Redis структуры
export interface UserCounterData {
  messageCount: number
  spamCount: number
  lastActivity: number
  createdAt: number
}

export interface UserMetaData {
  username?: string
  firstName: string
  updatedAt: number
}

export interface UserSpamData {
  totalSpam: number
  lastSpamAt: number
  lastReason?: string
}

export interface BotContext {
  chat?: { id: number }
  from?: {
    id: number
    username?: string
    first_name?: string
  }
  text?: string
  replyMessage?: any
  message?: any
}

export type TelegramBot = GramioBot
export type TelegramMessageContext = MessageContext<Bot>
export type TelegramNewMembersContext = NewChatMembersContext<Bot>
export type TelegramChatMemberContext = ChatMemberContext<Bot>
export type TelegramLeftMemberContext = LeftChatMemberContext<Bot>

export interface TelegramUser {
  id: number
  username?: string
  firstName: string
  isBot?: () => boolean
}
