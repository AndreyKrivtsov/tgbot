import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import { BOT_CONFIG, HTTP_CONFIG } from "../../../constants.js"

/**
 * Константы для ограничений пользователей
 */
const USER_RESTRICTIONS = {
  // Полные ограничения (для капчи)
  RESTRICTED: {
    can_send_messages: false,
    can_send_audios: false,
    can_send_documents: false,
    can_send_photos: false,
    can_send_videos: false,
    can_send_video_notes: false,
    can_send_voice_notes: false,
    can_send_polls: false,
    can_send_other_messages: false,
    can_add_web_page_previews: false,
    can_change_info: false,
    can_invite_users: false,
    can_pin_messages: false,
    can_manage_topics: false,
  },
  // Полные права (для снятия ограничений)
  UNRESTRICTED: {
    can_send_messages: true,
    can_send_audios: true,
    can_send_documents: true,
    can_send_photos: true,
    can_send_videos: true,
    can_send_video_notes: true,
    can_send_voice_notes: true,
    can_send_polls: true,
    can_send_other_messages: true,
    can_add_web_page_previews: true,
    can_change_info: false, // Обычные пользователи не могут менять инфо группы
    can_invite_users: true, // Обычные пользователи могут приглашать
    can_pin_messages: false, // Обычные пользователи не могут закреплять
    can_manage_topics: false, // Обычные пользователи не могут управлять топиками
  },
} as const

/**
 * Утилиты для управления ограничениями пользователей в Telegram чате
 */
export class UserRestrictions {
  private bot: TelegramBot
  private logger: Logger

  constructor(bot: TelegramBot, logger: Logger) {
    this.bot = bot
    this.logger = logger
  }

  /**
   * Ограничение пользователя (мьютинг для капчи)
   */
  async restrictUser(chatId: number, userId: number): Promise<void> {
    try {
      // Устанавливаем ограничения на 5 минут (время на прохождение капчи)
      const untilDate = Math.floor(Date.now() / 1000) + (1 * 60) // +1 минута в секундах

      await this.bot.restrictUser(chatId, userId, USER_RESTRICTIONS.RESTRICTED, untilDate)

      this.logger.i(`🔇 User ${userId} restricted in chat ${chatId} for 5 minutes`)
    } catch (error) {
      this.logger.e(`Failed to restrict user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Снятие ограничений с пользователя (после прохождения капчи)
   */
  async unrestrictUser(chatId: number, userId: number): Promise<void> {
    try {
      // Используем единые ограничения для снятия
      await this.bot.restrictUser(chatId, userId, USER_RESTRICTIONS.UNRESTRICTED)

      this.logger.i(`✅ User ${userId} unrestricted in chat ${chatId}`)
    } catch (error) {
      this.logger.e(`Failed to unrestrict user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Временный бан пользователя
   */
  async temporaryBanUser(chatId: number, userId: number, durationSec: number): Promise<void> {
    try {
      await this.bot.temporaryBanUser(chatId, userId, durationSec)

      this.logger.i(`⏰ User ${userId} temporarily banned in chat ${chatId} for ${durationSec} seconds`)
    } catch (error) {
      this.logger.e(`Failed to temporarily ban user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Постоянный бан пользователя из чата
   * ВНИМАНИЕ: Это постоянный бан! Используйте kickUserFromChat для временного удаления.
   */
  async banUserFromChat(chatId: number, userId: number): Promise<void> {
    try {
      await this.bot.banUser(chatId, userId)

      this.logger.i(`🚫 User ${userId} permanently banned from chat ${chatId}`)
    } catch (error) {
      this.logger.e(`Failed to ban user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Кик пользователя из чата (временный бан с автоматическим разбаном)
   * Используется для временного удаления (например, за спам)
   */
  async kickUserFromChat(chatId: number, userId: number, userName: string): Promise<void> {
    try {
      // Используем временный бан вместо kickUser для большей надежности
      // Бан на 1 минуту с автоматическим разбаном
      const kickDurationSec = Math.floor(BOT_CONFIG.AUTO_UNBAN_DELAY_MS / 1000) // Конвертируем мс в секунды
      await this.bot.temporaryBanUser(chatId, userId, kickDurationSec)

      this.logger.i(`👢 User ${userName} (${userId}) kicked from chat ${chatId} for ${kickDurationSec} seconds`)
    } catch (error) {
      this.logger.e(`Failed to kick user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Разбан пользователя
   */
  async unbanUserFromChat(chatId: number, userId: number, userName: string): Promise<void> {
    try {
      await this.bot.unbanUser(chatId, userId)

      this.logger.i(`✅ User ${userName} (${userId}) unbanned from chat ${chatId}`)
    } catch (error) {
      this.logger.e(`Failed to unban user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Отправка сообщения
   */
  async sendMessage(chatId: number, text: string): Promise<void> {
    try {
      await this.bot.sendMessage({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      })
    } catch (error) {
      this.logger.e("Failed to send message:", error)
      throw error
    }
  }

  /**
   * Отправка сообщения с автоудалением в групповых чатах
   * В приватных чатах сообщения остаются, в групповых - удаляются автоматически
   */
  async sendGroupMessage(chatId: number, text: string, parseMode: "HTML" | "Markdown" | "MarkdownV2" = "Markdown"): Promise<void> {
    try {
      await this.bot.sendGroupMessage({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }, BOT_CONFIG.MESSAGE_DELETE_LONG_TIMEOUT_MS)
    } catch (error) {
      this.logger.e("Failed to send group message:", error)
      throw error
    }
  }

  /**
   * Удаление сообщения
   */
  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.bot.deleteMessage(chatId, messageId)
    } catch (error) {
      this.logger.e("Failed to delete message:", error)
      throw error
    }
  }

  /**
   * Отправка typing индикатора
   */
  async sendTypingAction(chatId: number): Promise<void> {
    try {
      await this.bot.sendChatAction(chatId, "typing")
    } catch (error) {
      this.logger.e("Failed to send typing action:", error)
    }
  }
}
