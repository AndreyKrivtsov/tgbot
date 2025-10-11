import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import { TelegramModerationAdapter } from "./ModerationAdapter.js"
import type { CaptchaActionsPort } from "../../CaptchaService/index.js"

export class CaptchaTelegramAdapter implements CaptchaActionsPort {
  private bot: TelegramBot
  private logger: Logger
  private moderation: TelegramModerationAdapter

  constructor(bot: TelegramBot, logger: Logger) {
    this.bot = bot
    this.logger = logger
    this.moderation = new TelegramModerationAdapter(bot, logger)
  }

  async sendCaptchaMessage(
    chatId: number,
    userId: number,
    question: number[],
    options: number[],
    correctAnswer: number,
  ): Promise<number> {
    const inlineKeyboard = options.map((option: number, index: number) => [{
      text: `${option}`,
      callback_data: `captcha_${userId}_${index}_${option === correctAnswer ? "correct" : "wrong"}`,
    }])

    const sentMessage = await this.bot.sendMessage({
      chat_id: chatId,
      text: `Ответьте на пример: ${question[0]} + ${question[1]} = ?`,
      reply_markup: { inline_keyboard: inlineKeyboard },
    })

    const questionMessageId = (sentMessage as any)?.messageId || (sentMessage as any)?.message_id || 0
    return questionMessageId
  }

  async sendResultMessage(chatId: number, text: string, autoDeleteMs?: number): Promise<void> {
    if (autoDeleteMs && autoDeleteMs > 0) {
      await this.bot.sendGroupMessage({
        chat_id: chatId,
        text,
      }, autoDeleteMs)
      return
    }

    await this.bot.sendMessage({
      chat_id: chatId,
      text,
    })
  }

  async restrictUser(chatId: number, userId: number, durationSec?: number): Promise<void> {
    await this.moderation.restrictUser(chatId, userId, durationSec ?? 60)
  }

  async unrestrictUser(chatId: number, userId: number): Promise<void> {
    await this.moderation.unrestrictUser(chatId, userId)
  }

  async kickUser(chatId: number, userId: number, userName: string, autoUnbanDelayMs?: number): Promise<void> {
    await this.moderation.kickUser(chatId, userId, userName, autoUnbanDelayMs)
  }

  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    await this.moderation.deleteMessage(chatId, messageId)
  }
}
