import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import type { CaptchaManager } from "../features/CaptchaManager.js"
import { getMessage } from "../utils/Messages.js"

/**
 * Обработчик callback запросов (inline кнопки)
 */
export class CallbackHandler {
  private logger: Logger
  private bot: TelegramBot
  private captchaManager?: CaptchaManager

  constructor(logger: Logger, bot: TelegramBot, captchaManager?: CaptchaManager) {
    this.logger = logger
    this.bot = bot
    this.captchaManager = captchaManager
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
        if (!this.captchaManager) {
          await this.answerCallback(context, getMessage("callback_captcha_unavailable"))
          return
        }

        const result = await this.captchaManager.handleCaptchaCallback(context, callbackData)
        if (!result) {
          await this.answerCallback(context, getMessage("callback_unknown_command"))
        }
      } else {
        await this.answerCallback(context, getMessage("callback_unknown_command"))
      }
    } catch (error) {
      this.logger.e("❌ Error handling callback query:", error)
      await this.answerCallback(context, getMessage("callback_general_error"))
    }
  }

  /**
   * Обработка callback с капчей (legacy)
   */
  async handleCaptchaCallback(context: any, callbackData: string): Promise<boolean> {
    try {
      const userId = context.from?.id
      if (!userId) {
        await this.answerCallback(context, getMessage("callback_user_error"))
        return false
      }

      // Парсим callback data в формате: captcha_${userId}_${optionIndex}_${correct|wrong}
      const callbackParts = callbackData.split("_")
      if (callbackParts.length !== 4 || callbackParts[0] !== "captcha") {
        this.logger.e(`❌ Invalid callback data format: ${callbackData}`)
        await this.answerCallback(context, getMessage("callback_invalid_format"))
        return false
      }

      const callbackUserId = Number.parseInt(callbackParts[1] || "0")
      const isCorrect = callbackParts[3] === "correct"

      // Проверяем, что пользователь отвечает на свою капчу
      if (callbackUserId !== userId) {
        this.logger.w(`❌ User ${userId} trying to answer captcha for user ${callbackUserId}`)
        return false
      }

      // Отвечаем на callback
      const callbackResponse = isCorrect
        ? getMessage("callback_captcha_correct")
        : getMessage("callback_captcha_wrong")

      await this.answerCallback(context, callbackResponse)

      return true
    } catch (error) {
      this.logger.e("Error handling captcha callback:", error)
      await this.answerCallback(context, getMessage("callback_general_error"))
      return false
    }
  }

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

  /**
   * Валидация callback data
   */
  private isValidCallbackData(callbackData: string): boolean {
    if (!callbackData || typeof callbackData !== "string") {
      return false
    }

    // Проверяем известные форматы
    if (callbackData.startsWith("captcha_")) {
      const parts = callbackData.split("_")
      const userIdStr = parts[1]
      return Boolean(parts.length === 4 && userIdStr && !Number.isNaN(Number.parseInt(userIdStr, 10)))
    }

    return false
  }

  /**
   * Получение информации о callback'e
   */
  parseCallbackData(callbackData: string): { type: string, userId?: number, action?: string } | null {
    if (!this.isValidCallbackData(callbackData)) {
      return null
    }

    if (callbackData.startsWith("captcha_")) {
      const parts = callbackData.split("_")
      const userIdStr = parts[1]

      if (!userIdStr) {
        return null
      }

      return {
        type: "captcha",
        userId: Number.parseInt(userIdStr, 10),
        action: parts[3], // "correct" или "wrong"
      }
    }

    return null
  }

  /**
   * Проверка доступности капча менеджера
   */
  hasCaptchaManager(): boolean {
    return !!this.captchaManager && this.captchaManager.isAvailable()
  }

  /**
   * Получение статистики callback'ов
   */
  getCallbackStats(): { captchaAvailable: boolean } {
    return {
      captchaAvailable: this.hasCaptchaManager(),
    }
  }
}
