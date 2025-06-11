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
      await this.bot.api.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
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
      await this.bot.api.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
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
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
          can_manage_topics: false,
        },
      })

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
    const untilDate = Math.floor(Date.now() / HTTP_CONFIG.UNIX_TIMESTAMP_DIVIDER) + durationSec

    try {
      await this.bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
        until_date: untilDate,
      })

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
      await this.bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
      })

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
      await this.bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
      })

      // Автоматически разбаниваем через небольшую задержку
      setTimeout(async () => {
        try {
          await this.bot.api.unbanChatMember({
            chat_id: chatId,
            user_id: userId,
          })
          this.logger.i(`✅ User ${userName} (${userId}) unbanned after kick`)
        } catch (unbanError) {
          this.logger.e(`Failed to unban user ${userId} after kick:`, unbanError)
        }
      }, BOT_CONFIG.AUTO_UNBAN_DELAY_MS)

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
      await this.bot.api.unbanChatMember({
        chat_id: chatId,
        user_id: userId,
      })

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
      await this.bot.api.sendMessage({
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
   * Удаление сообщения
   */
  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.bot.api.deleteMessage({
        chat_id: chatId,
        message_id: messageId,
      })
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
      await this.bot.api.sendChatAction({
        chat_id: chatId,
        action: "typing",
      })
    } catch (error) {
      this.logger.e("Failed to send typing action:", error)
    }
  }
}
