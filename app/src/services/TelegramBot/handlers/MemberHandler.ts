import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBotSettings, TelegramNewMembersContext } from "../types/index.js"
import type { CaptchaManager } from "../features/CaptchaManager.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"
import type { UserManager } from "../features/UserManager.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"

/**
 * Обработчик событий участников группы
 */
export class MemberHandler {
  private logger: Logger
  private settings: TelegramBotSettings
  private captchaManager: CaptchaManager
  private userRestrictions: UserRestrictions
  private userManager: UserManager
  private chatRepository: ChatRepository
  private captchaService?: CaptchaService

  constructor(
    logger: Logger,
    settings: TelegramBotSettings,
    captchaManager: CaptchaManager,
    userRestrictions: UserRestrictions,
    userManager: UserManager,
    chatRepository: ChatRepository,
    captchaService?: CaptchaService,
  ) {
    this.logger = logger
    this.settings = settings
    this.captchaManager = captchaManager
    this.userRestrictions = userRestrictions
    this.userManager = userManager
    this.chatRepository = chatRepository
    this.captchaService = captchaService
  }

  /**
   * Обработка новых участников
   */
  async handleNewChatMembers(context: TelegramNewMembersContext): Promise<void> {
    try {
      const chatId = context.chat.id

      // Проверяем, есть ли чат в базе данных
      const chatExists = await this.chatRepository.chatExists(chatId)
      if (!chatExists) {
        this.logger.w(`Chat ${chatId} not found in database, skipping new members processing`)
        return
      }

      const newMembers = context.newChatMembers
      const messageId = (context as any).messageId || (context as any).message_id || context.id

      // Удаляем системное сообщение о присоединении
      if (this.settings.deleteSystemMessages && messageId) {
        await this.userRestrictions.deleteMessage(chatId, messageId)
      }

      // Обрабатываем новых участников
      if (newMembers?.length) {
        const realUsers = newMembers.filter((user: any) => !user.isBot())
        const bots = newMembers.filter((user: any) => user.isBot())
        
        if (realUsers.length > 0) {
          this.logger.i(`🎯 Processing ${realUsers.length} new members in chat ${chatId}`)
        }
        
        if (bots.length > 0) {
          this.logger.d(`🤖 Skipping ${bots.length} bots`)
        }

        for (const user of realUsers) {
          await this.captchaManager.initiateUserCaptcha(chatId, user)
        }
      }
    } catch (error) {
      this.logger.e("❌ Error handling new chat members:", error)
    }
  }

  /**
   * Обработка ушедших участников
   */
  async handleLeftChatMember(context: any): Promise<void> {
    try {
      const chatId = context.chat?.id
      const leftUser = context.leftChatMember
      const messageId = context.messageId || context.message_id || context.id

      if (!chatId) {
        this.logger.w("No chat ID in left member context")
        return
      }

      // Удаляем системное сообщение о покидании/исключении
      if (this.settings.deleteSystemMessages && messageId) {
        await this.userRestrictions.deleteMessage(chatId, messageId)
      }

      // Очищаем данные пользователя
      if (leftUser?.id) {
        await this.cleanupUserData(leftUser.id)
      }
    } catch (error) {
      this.logger.e("❌ Error handling left chat member:", error)
    }
  }

  /**
   * Обработка изменений участника чата
   */
  async handleChatMember(context: any): Promise<void> {
    try {
      const chatId = context.chat?.id
      const newChatMember = context.newChatMember
      const oldChatMember = context.oldChatMember

      if (!chatId) {
        this.logger.w("No chat ID in chat member context")
        return
      }

      // Если пользователь покинул чат или был исключен
      if (newChatMember?.status === "left" || newChatMember?.status === "kicked") {
        const userId = newChatMember.user?.id
        if (userId) {
          await this.cleanupUserData(userId)
        }
      }
    } catch (error) {
      this.logger.e("❌ Error handling chat member update:", error)
    }
  }

  /**
   * Очистка данных пользователя при покидании чата
   */
  private async cleanupUserData(userId: number): Promise<void> {
    try {
      let cleanedItems = 0

      // Удаляем пользователя из ограниченных (капча)
      if (this.captchaService && this.captchaService.isUserRestricted(userId)) {
        this.captchaService.removeRestrictedUser(userId)
        cleanedItems++
      }

      // Удаляем счетчик сообщений пользователя
      const hasCounter = await this.userManager.hasMessageCounter(userId)
      if (hasCounter) {
        await this.userManager.deleteMessageCounter(userId)
        cleanedItems++
      }

      if (cleanedItems > 0) {
        this.logger.d(`🧹 Cleaned ${cleanedItems} items for user ${userId}`)
      }
    } catch (error) {
      this.logger.e(`Error cleaning up data for user ${userId}:`, error)
    }
  }

  /**
   * Проверка доступности капча сервиса
   */
  hasCaptchaService(): boolean {
    return this.captchaManager.isAvailable()
  }

  /**
   * Получение статистики обработки участников
   */
  async getMemberStats(): Promise<{ restrictedUsers: number }> {
    const restrictedUsers = this.captchaService
      ? this.captchaService.getAllRestrictedUsers().length
      : 0

    return {
      restrictedUsers,
    }
  }

  /**
   * Принудительная очистка данных пользователя (для админских команд)
   */
  async forceCleanupUser(userId: number): Promise<boolean> {
    try {
      await this.cleanupUserData(userId)
      this.logger.i(`🧹 Force cleanup completed for user ${userId}`)
      return true
    } catch (error) {
      this.logger.e(`Error in force cleanup for user ${userId}:`, error)
      return false
    }
  }
}
