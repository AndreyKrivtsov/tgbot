import type { Logger } from "../../../helpers/Logger.js"
import type { CaptchaManager } from "../features/CaptchaManager.js"

/**
 * Обработчик callback запросов (inline кнопки)
 */
export class CallbackHandler {
  private logger: Logger
  private captchaManager: CaptchaManager

  constructor(
    logger: Logger,
    captchaManager: CaptchaManager,
  ) {
    this.logger = logger
    this.captchaManager = captchaManager
  }

  /**
   * Основной обработчик callback запросов
   */
  async handleCallback(context: any): Promise<void> {
    this.logger.i("🔘 Processing callback query...")

    try {
      const callbackData = context.data
      const userId = context.from?.id

      if (!userId) {
        this.logger.w("No user ID in callback context")
        await this.answerCallback(context, "❌ Ошибка определения пользователя")
        return
      }

      // Определяем тип callback'a по префиксу
      if (callbackData.startsWith("captcha_")) {
        await this.handleCaptchaCallback(context, callbackData)
      } else {
        this.logger.w(`Unknown callback data format: ${callbackData}`)
        await this.answerCallback(context, "❌ Неизвестная команда")
      }
    } catch (error) {
      this.logger.e("❌ Error handling callback query:", error)
      await this.answerCallback(context, "❌ Произошла ошибка")
    }
  }

  /**
   * Обработка callback'ов капчи
   */
  private async handleCaptchaCallback(context: any, callbackData: string): Promise<void> {
    try {
      const userId = context.from?.id
      if (!userId) {
        await this.answerCallback(context, "❌ Ошибка определения пользователя")
        return
      }

      // Парсим callback data в формате: captcha_${userId}_${optionIndex}_${correct|wrong}
      const callbackParts = callbackData.split("_")
      if (callbackParts.length !== 4 || callbackParts[0] !== "captcha") {
        this.logger.e(`❌ Invalid callback data format: ${callbackData}`)
        await this.answerCallback(context, "❌ Неверный формат данных")
        return
      }

      const callbackUserId = Number.parseInt(callbackParts[1] || "0")
      const isCorrect = callbackParts[3] === "correct"

      // Проверяем, что пользователь отвечает на свою капчу
      if (callbackUserId !== userId) {
        this.logger.w(`❌ User ${userId} trying to answer captcha for user ${callbackUserId}`)
        await this.answerCallback(context, "Это не ваша капча!")
        return
      }

      const success = await this.captchaManager.handleCaptchaCallback(context, callbackData)

      if (success) {
        // Определяем результат по callback data
        const message = isCorrect
          ? "✅ Правильно!"
          : "❌ Неправильный ответ!"

        await this.answerCallback(context, message)
      } else {
        await this.answerCallback(context, "⚠️ Капча не найдена")
      }
    } catch (error) {
      this.logger.e("Error handling captcha callback:", error)
      await this.answerCallback(context, "❌ Произошла ошибка")
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
