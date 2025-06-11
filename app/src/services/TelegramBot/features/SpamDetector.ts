import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { AntiSpamService } from "../../AntiSpamService/index.js"
import type { TelegramBot, UserMessageCounter } from "../types/index.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"
import type { UserManager } from "./UserManager.js"
import type { Bot, MessageContext } from "gramio"

/**
 * Детектор и обработчик спама
 */
export class SpamDetector {
  private logger: Logger
  private config: AppConfig
  private antiSpamService?: AntiSpamService
  private bot: TelegramBot
  private userRestrictions: UserRestrictions
  private userManager: UserManager
  private deleteTimeoutMs: number

  constructor(
    logger: Logger,
    config: AppConfig,
    bot: TelegramBot,
    userRestrictions: UserRestrictions,
    userManager: UserManager,
    deleteTimeoutMs: number = 20000,
    antiSpamService?: AntiSpamService,
  ) {
    this.logger = logger
    this.config = config
    this.bot = bot
    this.userRestrictions = userRestrictions
    this.userManager = userManager
    this.deleteTimeoutMs = deleteTimeoutMs
    this.antiSpamService = antiSpamService
  }

  /**
   * Проверка сообщения на спам
   */
  async checkMessage(userId: number, messageText: string, _userCounter?: UserMessageCounter): Promise<{ isSpam: boolean, reason?: string }> {
    if (!this.antiSpamService) {
      return { isSpam: false }
    }

    try {
      const spamResult = await this.antiSpamService.checkMessage(userId, messageText)

      if (spamResult.isSpam) {
        // Увеличиваем счетчик спама через UserManager
        this.userManager.incrementSpamCounter(userId)

        this.logger.w(`🚨 Spam detected from user ${userId}: ${spamResult.reason || messageText}`)
        return {
          isSpam: true,
          reason: spamResult.reason || "Spam detected",
        }
      }

      return { isSpam: false }
    } catch (error) {
      this.logger.e("Error checking message for spam:", error)
      return { isSpam: false }
    }
  }

  /**
   * Обработка спам сообщения с логикой предупреждения и кика
   */
  async handleSpamMessage(context: MessageContext<Bot>, reason?: string, userCounter?: UserMessageCounter): Promise<void> {
    try {
      const userId = context.from?.id
      const chatId = context.chat?.id
      const firstName = userCounter?.firstName || context.from?.firstName || "Unknown"
      const username = userCounter?.username || context.from?.username

      if (!userId || !chatId || !userCounter) {
        this.logger.w("Cannot handle spam message: missing userId, chatId or userCounter")
        return
      }

      // Удаляем спам сообщение
      if (context.id) {
        await this.userRestrictions.deleteMessage(chatId, context.id)
      }

      if (userCounter.spamCount < 2) {
        await this.sendSpamWarning(chatId, firstName, userCounter.spamCount, username)
      } else {
        await this.kickUserForSpam(chatId, userId, firstName, username)
      }
    } catch (error) {
      this.logger.e("Error handling spam message:", error)
    }
  }

  /**
   * Отправка предупреждения о спаме
   */
  private async sendSpamWarning(chatId: number, firstName: string, count: number, username?: string): Promise<void> {
    try {
      const displayName = username ? `${firstName}, @${username}` : firstName
      const textModificator = count > 1 ? "Повторное c" : ""
      const warningText = `Хмм... 🧐\n${textModificator || "С"}ообщение от [${displayName}] похоже на спам.\n\nСообщение удалено. \n\n${this.config.ADMIN_USERNAME || ""}`

      const messageResult = await this.bot.api.sendMessage({
        chat_id: chatId,
        text: warningText,
        parse_mode: "HTML",
      })

      // Удаляем предупреждение через заданное время
      setTimeout(() => {
        this.userRestrictions.deleteMessage(chatId, messageResult.message_id)
      }, this.deleteTimeoutMs)
    } catch (error) {
      this.logger.e("Error sending spam warning:", error)
    }
  }

  /**
   * Кик пользователя за спам
   */
  private async kickUserForSpam(chatId: number, userId: number, firstName: string, username?: string): Promise<void> {
    try {
      const displayName = username ? `${firstName}, @${username}` : firstName
      const kickText = `Ну вот... 🤓\n[${displayName}] исключен из чата за спам.\n\n${this.config.ADMIN_USERNAME || ""}`

      // Отправляем сообщение о кике
      const messageResult = await this.bot.api.sendMessage({
        chat_id: chatId,
        text: kickText,
        parse_mode: "HTML",
      })

      // Кикаем пользователя
      await this.userRestrictions.kickUserFromChat(chatId, userId, firstName)

      // Удаляем сообщение о кике через заданное время
      setTimeout(() => {
        this.userRestrictions.deleteMessage(chatId, messageResult.message_id)
      }, this.deleteTimeoutMs)

      // Очищаем счетчик пользователя
      this.userManager.clearUserCounter(userId)
    } catch (error) {
      this.logger.e("Error kicking user for spam:", error)
    }
  }

  /**
   * Сброс счетчика спама для пользователя
   */
  resetSpamCounter(userId: number): boolean {
    return this.userManager.resetSpamCounter(userId)
  }

  /**
   * Получение статистики спама
   */
  getSpamStats(): { totalUsers: number, spamUsers: number, totalMessages: number, totalSpam: number } {
    return this.userManager.getSpamStats()
  }

  /**
   * Проверка доступности антиспам сервиса
   */
  isAvailable(): boolean {
    return !!this.antiSpamService
  }

  /**
   * Установка сервиса антиспама
   */
  setAntiSpamService(antiSpamService: AntiSpamService): void {
    this.antiSpamService = antiSpamService
  }
}
