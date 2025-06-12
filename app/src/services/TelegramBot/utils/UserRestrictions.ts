import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import { BOT_CONFIG, HTTP_CONFIG } from "../../../constants.js"

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
   * Ограничение пользователя (мьютинг)
   */
  async restrictUser(chatId: number, userId: number): Promise<void> {
    try {
      await this.bot.restrictUser(chatId, userId, {
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
      })

      this.logger.i(`🔇 User ${userId} restricted in chat ${chatId}`)
    } catch (error) {
      this.logger.e(`Failed to restrict user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Снятие ограничений с пользователя
   */
  async unrestrictUser(chatId: number, userId: number): Promise<void> {
    try {
      await this.bot.unrestrictUser(chatId, userId)

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
   * Удаление пользователя из чата
   */
  async deleteUserFromChat(chatId: number, userId: number): Promise<void> {
    try {
      await this.bot.banUser(chatId, userId)

      this.logger.i(`🗑️ User ${userId} deleted from chat ${chatId}`)
    } catch (error) {
      this.logger.e(`Failed to delete user ${userId}:`, error)
      throw error
    }
  }

  /**
   * Кик пользователя из чата
   */
  async kickUserFromChat(chatId: number, userId: number, userName: string): Promise<void> {
    try {
      await this.bot.kickUser(chatId, userId, BOT_CONFIG.AUTO_UNBAN_DELAY_MS)

      this.logger.i(`👢 User ${userName} (${userId}) kicked from chat ${chatId}`)
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
      }, BOT_CONFIG.MESSAGE_DELETE_TIMEOUT_MS)
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
