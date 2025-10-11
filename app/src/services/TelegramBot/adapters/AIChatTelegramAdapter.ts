import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import type { AIChatActionsPort } from "../../AIChatService/interfaces.js"

export class AIChatTelegramAdapter implements AIChatActionsPort {
  private bot: TelegramBot
  private logger: Logger

  constructor(bot: TelegramBot, logger: Logger) {
    this.bot = bot
    this.logger = logger
  }

  async sendTyping(chatId: number): Promise<void> {
    try {
      await this.bot.sendChatAction(chatId, "typing")
    } catch (error) {
      this.logger.e("Error sending typing action:", error)
    }
  }

  async sendMessage(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    try {
      const params: any = { chat_id: chatId, text }
      if (replyToMessageId) {
        params.reply_parameters = { message_id: replyToMessageId }
      }
      await this.bot.sendMessage(params)
    } catch (error) {
      this.logger.e("Error sending AI message:", error)
    }
  }

  async sendGroupMessage(chatId: number, text: string, autoDeleteMs?: number): Promise<void> {
    try {
      await this.bot.sendGroupMessage({ chat_id: chatId, text }, autoDeleteMs || 0)
    } catch (error) {
      this.logger.e("Error sending AI group message:", error)
    }
  }

  async getBotInfo(): Promise<{ id: number, username?: string } | null> {
    try {
      const me = await this.bot.getMe()
      return { id: me.id, username: me.username }
    } catch (error) {
      this.logger.e("Error getting bot info:", error)
      return null
    }
  }
}
