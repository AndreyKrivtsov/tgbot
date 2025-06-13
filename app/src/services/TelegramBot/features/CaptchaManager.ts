import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { BotContext, TelegramBot } from "../types/index.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"
import { getMessage } from "../utils/Messages.js"
import type { User } from "gramio"
import { BOT_CONFIG } from "../../../constants.js"

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
  async initiateUserCaptcha(chatId: number, user: User): Promise<void> {
    if (!this.captchaService) {
      this.logger.w("❌ Captcha service not available")
      return
    }

    // Проверяем, не создана ли уже капча для этого пользователя
    if (this.captchaService.isUserRestricted(user.id)) {
      this.logger.i(`🔄 Captcha already exists for user ${user.id} (@${user.username || "no_username"}), skipping`)
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

        // Диагностика: капча показана пользователю
        this.logger.i(`🧩 Captcha shown to user ${user.id} (@${user.username || "no_username"}) in chat ${chatId}`)
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
    user: User,
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
      const captchaText = this.formatCaptchaMessage(question, user)
      const inlineKeyboard = this.createCaptchaKeyboard(user.id, options, correctAnswer)

      const sentMessage = await this.bot.sendMessage({
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

      // Отвечаем на callback query с соответствующим сообщением
      const callbackResponse = isCorrect
        ? getMessage("callback_captcha_correct")
        : getMessage("callback_captcha_wrong")

      await this.answerCallback(context, callbackResponse)

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
   * Успешная капча
   */
  private async handleCaptchaSuccess(user: any): Promise<void> {
    try {
      await this.userRestrictions.unrestrictUser(user.chatId, user.userId)
      // Диагностика: правильный ответ на капчу
      this.logger.i(`✅ User ${user.userId} (@${user.username || "no_username"}) passed captcha in chat ${user.chatId}`)
    } catch (error) {
      this.logger.e("Error handling captcha success:", error)
    }
  }

  /**
   * Неправильная капча
   */
  private async handleCaptchaFailed(user: any): Promise<void> {
    try {
      // Удаляем исходное сообщение с капчей
      await this.userRestrictions.deleteMessage(user.chatId, user.questionId)

      await this.userRestrictions.kickUserFromChat(user.chatId, user.userId, user.username)

      const name = this.formatUserMention(user)
      const failText = getMessage("captcha_failed", { name })

      const _messageResult = await this.bot.sendAutoDeleteMessage({
        chat_id: user.chatId,
        text: failText,
        parse_mode: "HTML",
      }, BOT_CONFIG.MESSAGE_DELETE_SHORT_TIMEOUT_MS) // 60 секунд

      // Диагностика: неправильный ответ на капчу
      this.logger.w(`❌ User ${user.userId} (@${user.username || "no_username"}) failed captcha in chat ${user.chatId}`)
    } catch (error) {
      this.logger.e("Error handling captcha failure:", error)
    }
  }

  /**
   * Таймаут капчи
   */
  async handleCaptchaTimeout(user: any): Promise<void> {
    try {
      // Удаляем исходное сообщение с капчей
      await this.userRestrictions.deleteMessage(user.chatId, user.questionId)

      await this.userRestrictions.temporaryBanUser(user.chatId, user.userId, 40) // 40 секунд бан

      const name = this.formatUserMention(user)
      const timeoutText = getMessage("captcha_timeout", { name })

      const _messageResult = await this.bot.sendAutoDeleteMessage({
        chat_id: user.chatId,
        text: timeoutText,
        parse_mode: "HTML",
      }, BOT_CONFIG.MESSAGE_DELETE_SHORT_TIMEOUT_MS) // 60 секунд

      // Диагностика: таймаут капчи
      this.logger.w(`⏰ User ${user.userId} (@${user.username || "no_username"}) captcha timeout in chat ${user.chatId}`)
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
  private formatCaptchaMessage(question: number[], user: User): string {
    const userMention = this.formatUserMention(user)

    return getMessage("captcha_welcome", {
      question: `${question[0]} + ${question[1]}`,
      userMention,
    })
  }

  /**
   * Форматирование упоминания пользователя
   */
  private formatUserMention(user: User): string {
    // Пробуем разные варианты получения имени
    const firstName = user.firstName || "unk"

    // Укорачиваем имя если оно длиннее 10 символов
    let displayName = firstName
    if (displayName.length > 10) {
      displayName = `${displayName.substring(0, 10)}...`
    }

    let displayUsername = user.username
    if (displayUsername && displayUsername.length > 10) {
      displayUsername = `${displayUsername.substring(0, 10)}...`
    }

    // Экранируем HTML символы в имени
    displayName = this.escapeHtml(displayName)

    // Создаем HTML-ссылку на пользователя
    if (user.username) {
      return `<a href="https://t.me/${user.username}">@${displayUsername}</a>`
    } else {
      // Если нет username, создаем ссылку через user ID
      return `<a href="tg://user?id=${user.id}">${displayName}</a>`
    }
  }

  /**
   * Экранирование HTML символов
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
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
