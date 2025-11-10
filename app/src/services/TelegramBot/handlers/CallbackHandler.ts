import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import { getMessage } from "../../../shared/messages/index.js"

/**
 * Обработчик callback запросов (inline кнопки)
 */
export class CallbackHandler {
  private logger: Logger
  private bot: TelegramBot
  private captchaService?: CaptchaService

  constructor(logger: Logger, bot: TelegramBot, captchaService?: CaptchaService) {
    this.logger = logger
    this.bot = bot
    this.captchaService = captchaService
  }

  /**
   * Основной обработчик callback запросов
   */
  async handleCallbackQuery(context: any): Promise<void> {
    try {
      const userId = context.from?.id
      const callbackData = context.data

      if (!userId) {
        await this.answerCallback(context, getMessage("callback_user_error"))
        return
      }

      // Обработка капчи
      if (callbackData?.startsWith("captcha_")) {
        if (!this.captchaService) {
          await this.answerCallback(context, getMessage("callback_captcha_unavailable"))
          return
        }
        const userId = context.from?.id
        const parts = callbackData.split("_")
        if (parts.length !== 4 || parts[0] !== "captcha") {
          await this.answerCallback(context, getMessage("callback_invalid_format"))
          return
        }
        const callbackUserId = Number.parseInt(parts[1] || "0", 10)
        const isCorrect = parts[3] === "correct"

        if (callbackUserId !== userId) {
          // Чужая капча — игнор
          return
        }

        // Делегируем use-case'у
        try {
          await this.captchaService.submitAnswer({
            userId,
            isCorrect,
          })
        } catch (e) {
          this.logger.e("Error submitting captcha answer:", e)
          await this.answerCallback(context, getMessage("callback_general_error"))
          return
        }

        const replyText = isCorrect ? getMessage("callback_captcha_correct") : getMessage("callback_captcha_wrong")
        await this.answerCallback(context, replyText)
      } else {
        await this.answerCallback(context, getMessage("callback_unknown_command"))
      }
    } catch (error) {
      this.logger.e("❌ Error handling callback query:", error)
      await this.answerCallback(context, getMessage("callback_general_error"))
    }
  }

  // legacy handleCaptchaCallback удалён

  /**
   * Отправка ответа на callback query
   */
  private async answerCallback(context: any, text: string): Promise<void> {
    try {
      if (context.answerCallbackQuery) {
        await context.answerCallbackQuery({ text })
      } else if (context.answer) {
        await context.answer(text)
      } else {
        this.logger.w("No method to answer callback query found in context")
      }
    } catch (error) {
      this.logger.e("Error answering callback query:", error)
    }
  }

}
