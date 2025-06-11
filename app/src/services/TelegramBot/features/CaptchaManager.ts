import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { BotContext, TelegramBot } from "../types/index.js"
import { MessageFormatter } from "../utils/MessageFormatter.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"

/**
 * Менеджер капчи для новых пользователей
 */
export class CaptchaManager {
  private logger: Logger
  private config: AppConfig
  private captchaService?: CaptchaService
  private bot: TelegramBot
  private userRestrictions: UserRestrictions

  constructor(
    logger: Logger,
    config: AppConfig,
    bot: TelegramBot,
    userRestrictions: UserRestrictions,
    captchaService?: CaptchaService,
  ) {
    this.logger = logger
    this.config = config
    this.bot = bot
    this.userRestrictions = userRestrictions
    this.captchaService = captchaService
  }

  /**
   * Инициация капчи для пользователя
   */
  async initiateUserCaptcha(chatId: number, user: any): Promise<void> {
    if (!this.captchaService) {
      this.logger.w("❌ Captcha service not available")
      return
    }

    // Проверяем, не создана ли уже капча для этого пользователя
    if (this.captchaService.isUserRestricted(user.id)) {
      return
    }

    try {
      // Генерируем капчу
      const captcha = this.captchaService.generateCaptcha()

      // Проверяем валидность капчи
      if (!this.isValidCaptcha(captcha)) {
        this.logger.e("❌ Invalid captcha question generated")
        return
      }

      // Отправляем капчу
      const sentMessage = await this.sendCaptchaMessage(
        chatId,
        user,
        captcha.question,
        captcha.options,
      )

      // Добавляем пользователя в ограниченные
      if (sentMessage) {
        this.captchaService.addRestrictedUser(
          user.id,
          chatId,
          sentMessage?.messageId || sentMessage?.message_id || 0,
          captcha.answer,
          user.username,
          user.firstName,
        )
      }

      // Ограничиваем права пользователя
      await this.userRestrictions.restrictUser(chatId, user.id)
    } catch (error) {
      this.logger.e(`❌ Error initiating captcha for user ${user.id}:`, error)
    }
  }

  /**
   * Отправка сообщения с капчей
   */
  private async sendCaptchaMessage(
    chatId: number,
    user: any,
    question: number[],
    options: number[],
  ): Promise<any> {
    // Проверяем валидность входных данных
    if (!question || question.length < 2
      || typeof question[0] !== "number" || typeof question[1] !== "number") {
      this.logger.e("❌ Invalid question data provided to sendCaptchaMessage")
      return null
    }

    // Выбираем правильный ответ
    const correctAnswer = question[0] + question[1]

    try {
      const captchaText = this.formatCaptchaMessage(question)
      const inlineKeyboard = this.createCaptchaKeyboard(user.id, options, correctAnswer)

      const sentMessage = await this.bot.api.sendMessage({
        chat_id: chatId,
        text: captchaText,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [inlineKeyboard],
        },
      })

      return sentMessage
    } catch (error) {
      this.logger.e("Error sending captcha message:", error)
      return null
    }
  }

  /**
   * Обработка ответа на капчу
   */
  async handleCaptchaCallback(context: BotContext, callbackData: string): Promise<boolean> {
    if (!this.captchaService) {
      this.logger.w("❌ CaptchaService not available for callback")
      return false
    }

    try {
      const userId = context.from?.id
      if (!userId) {
        return false
      }

      // Парсим callback data в формате: captcha_${userId}_${optionIndex}_${correct|wrong}
      const callbackParts = callbackData.split("_")
      if (callbackParts.length !== 4 || callbackParts[0] !== "captcha") {
        this.logger.e(`❌ Invalid callback data format: ${callbackData}`)
        return false
      }

      const userIdStr = callbackParts[1]
      if (!userIdStr) {
        this.logger.e("❌ Missing userId in callback data")
        return false
      }

      const callbackUserId = Number.parseInt(userIdStr, 10)
      const isCorrect = callbackParts[3] === "correct"

      // Проверяем, что пользователь отвечает на свою капчу
      if (callbackUserId !== userId) {
        this.logger.w(`❌ User ${userId} trying to answer captcha for user ${callbackUserId}`)
        return false
      }

      const restrictedUser = this.captchaService.getRestrictedUser(userId)
      if (!restrictedUser) {
        this.logger.w("⚠️ No restricted user found for this callback")
        return false
      }

      if (isCorrect) {
        await this.handleCaptchaSuccess(restrictedUser)
      } else {
        await this.handleCaptchaFailed(restrictedUser)
      }

      // Удаляем сообщение с капчей
      await this.userRestrictions.deleteMessage(restrictedUser.chatId, restrictedUser.questionId)
      this.captchaService.removeRestrictedUser(userId)

      return true
    } catch (error) {
      this.logger.e("❌ Error handling captcha callback:", error)
      return false
    }
  }

  /**
   * Успешная капча
   */
  private async handleCaptchaSuccess(user: any): Promise<void> {
    try {
      await this.userRestrictions.unrestrictUser(user.chatId, user.userId)
      this.logger.i(`User ${user.userId} passed captcha`)
    } catch (error) {
      this.logger.e("Error handling captcha success:", error)
    }
  }

  /**
   * Неправильная капча
   */
  private async handleCaptchaFailed(user: any): Promise<void> {
    try {
      await this.userRestrictions.kickUserFromChat(user.chatId, user.userId, user.username)

      const name = user.username ? `@${user.username}` : user.firstName
      const failText = MessageFormatter.formatErrorMessage(`К сожалению, ${name} выбрал неправильный вариант ответа 😢`)

      const messageResult = await this.bot.api.sendMessage({
        chat_id: user.chatId,
        text: failText,
        parse_mode: "HTML",
      })

      // Удаляем сообщение через заданное время
      setTimeout(() => {
        this.userRestrictions.deleteMessage(user.chatId, messageResult.message_id)
      }, 60000) // 60 секунд

      this.logger.w(`User ${user.userId} failed captcha`)
    } catch (error) {
      this.logger.e("Error handling captcha failure:", error)
    }
  }

  /**
   * Таймаут капчи
   */
  async handleCaptchaTimeout(user: any): Promise<void> {
    try {
      await this.userRestrictions.temporaryBanUser(user.chatId, user.userId, 40) // 40 секунд бан

      const name = user.username ? `@${user.username}` : user.firstName
      const timeoutText = MessageFormatter.formatErrorMessage(`К сожалению, ${name} не выбрал ни один вариант ответа 🧐`)

      const messageResult = await this.bot.api.sendMessage({
        chat_id: user.chatId,
        text: timeoutText,
        parse_mode: "HTML",
      })

      // Удаляем сообщение через заданное время
      setTimeout(() => {
        this.userRestrictions.deleteMessage(user.chatId, messageResult.message_id)
      }, 60000) // 60 секунд

      this.logger.w(`User ${user.userId} captcha timeout`)
    } catch (error) {
      this.logger.e("Error handling captcha timeout:", error)
    }
  }

  /**
   * Проверка валидности капчи
   */
  private isValidCaptcha(captcha: any): boolean {
    return captcha.question
      && captcha.question.length >= 2
      && typeof captcha.question[0] === "number"
      && typeof captcha.question[1] === "number"
  }

  /**
   * Форматирование сообщения капчи
   */
  private formatCaptchaMessage(question: number[]): string {
    return `Добро пожаловать! Решите несложный пример:

${question[0]} + ${question[1]} = ?

Выберите правильный ответ:`
  }

  /**
   * Создание клавиатуры для капчи
   */
  private createCaptchaKeyboard(userId: number, options: number[], correctAnswer: number): any[] {
    return options.map((option, index) => ({
      text: option.toString(),
      callback_data: `captcha_${userId}_${index}_${option === correctAnswer ? "correct" : "wrong"}`,
    }))
  }

  /**
   * Проверка доступности сервиса капчи
   */
  isAvailable(): boolean {
    return !!this.captchaService
  }
}
