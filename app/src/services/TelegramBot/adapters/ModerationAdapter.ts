import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import { BOT_CONFIG } from "../../../constants.js"

const USER_RESTRICTIONS = {
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
    can_change_info: false,
    can_invite_users: true,
    can_pin_messages: false,
    can_manage_topics: false,
  },
} as const

/**
 * Единый адаптер модерации для Telegram.
 * Инкапсулирует ограничения/бан/кик/удаление сообщений и может переиспользоваться разными фичами.
 */
export class TelegramModerationAdapter {
  constructor(private bot: TelegramBot, private logger: Logger) {}

  async restrictUser(chatId: number, userId: number, durationSec?: number): Promise<void> {
    let untilDate: number | undefined
    if (durationSec !== null && durationSec !== undefined) {
      untilDate = Math.floor(Date.now() / 1000) + durationSec
    }
    await this.bot.restrictUser(chatId, userId, USER_RESTRICTIONS.RESTRICTED as any, untilDate)
    this.logger.i(`🔇 User ${userId} restricted in chat ${chatId} for ${durationSec ?? "default"}`)
  }

  async unrestrictUser(chatId: number, userId: number): Promise<void> {
    await this.bot.restrictUser(chatId, userId, USER_RESTRICTIONS.UNRESTRICTED as any)
    this.logger.i(`✅ User ${userId} unrestricted in chat ${chatId}`)
  }

  async kickUser(chatId: number, userId: number, userName: string, autoUnbanDelayMs?: number): Promise<void> {
    if (autoUnbanDelayMs && autoUnbanDelayMs > 0) {
      await this.bot.kickUser(chatId, userId, autoUnbanDelayMs)
      this.logger.i(`👢 User ${userName} (${userId}) kicked from chat ${chatId} for ${autoUnbanDelayMs} ms`)
      return
    }
    await this.bot.banUser(chatId, userId)
    this.logger.i(`🚫 User ${userId} permanently banned from chat ${chatId}`)
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.bot.deleteMessage(chatId, messageId)
  }

  async sendGroupMessage(chatId: number, text: string, parseMode?: "HTML" | "Markdown" | "MarkdownV2"): Promise<void> {
    await this.bot.sendGroupMessage({ chat_id: chatId, text, parse_mode: parseMode as any }, BOT_CONFIG.MESSAGE_DELETE_LONG_TIMEOUT_MS)
  }

  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.bot.sendMessage({ chat_id: chatId, text })
  }

  // Compatibility wrappers (match UserRestrictions API)
  async kickUserFromChat(chatId: number, userId: number, userName: string): Promise<void> {
    await this.kickUser(chatId, userId, userName, BOT_CONFIG.AUTO_UNBAN_DELAY_MS)
  }

  async banUserFromChat(chatId: number, userId: number): Promise<void> {
    await this.bot.banUser(chatId, userId)
  }

  async unbanUserFromChat(chatId: number, userId: number, userName: string): Promise<void> {
    await this.bot.unbanUser(chatId, userId)
    this.logger.i(`✅ User ${userName} (${userId}) unbanned from chat ${chatId}`)
  }
}
