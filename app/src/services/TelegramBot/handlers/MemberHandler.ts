import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBotSettings, TelegramNewMembersContext } from "../types/index.js"
import type { CaptchaManager } from "../features/CaptchaManager.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"
import type { UserManager } from "../features/UserManager.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { ChatAiRepository } from "../../../repository/ChatAiRepository.js"

/**
 * Обработчик событий участников группы
 */
export class MemberHandler {
  private logger: Logger
  private settings: TelegramBotSettings
  private captchaManager: CaptchaManager
  private userRestrictions: UserRestrictions
  private userManager: UserManager
  private chatRepository: ChatAiRepository
  private captchaService?: CaptchaService

  constructor(
    logger: Logger,
    settings: TelegramBotSettings,
    captchaManager: CaptchaManager,
    userRestrictions: UserRestrictions,
    userManager: UserManager,
    chatRepository: ChatAiRepository,
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
      this.logger.i("🎯 Processing new chat members...")

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

      // Детальное логирование для отладки
      this.logger.i("=== NEW CHAT MEMBERS EVENT ===")
      this.logger.i(`Chat ID: ${chatId}`)
      this.logger.i(`Message ID: ${messageId}`)
      this.logger.i(`New members count: ${newMembers?.length || 0}`)
      this.logger.i(`CaptchaManager available: ${this.captchaManager.isAvailable()}`)

      if (newMembers?.length) {
        newMembers.forEach((user: any, index: number) => {
          this.logger.i(`Member ${index + 1}: ${user.firstName} (ID: ${user.id}, isBot: ${user.isBot()})`)
        })

        for (const user of newMembers) {
          if (!user.isBot()) {
            this.logger.i(`🔐 Processing captcha for new member: ${user.firstName} (ID: ${user.id})`)
            await this.captchaManager.initiateUserCaptcha(chatId, user)
          } else {
            this.logger.i(`🤖 Skipping captcha for bot: ${user.firstName} (ID: ${user.id})`)
          }
        }
      }

      this.logger.i("✅ New chat members processing completed")
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

      this.logger.i(`👋 User left chat: ${leftUser?.firstName} (ID: ${leftUser?.id})`)
      this.logger.i(`💬 Chat ID: ${chatId}, Message ID: ${messageId}`)

      // Удаляем системное сообщение о покидании/исключении
      if (this.settings.deleteSystemMessages && messageId) {
        this.logger.i("🗑️ Deleting left chat member system message...")
        await this.userRestrictions.deleteMessage(chatId, messageId)
      }

      // Очищаем данные пользователя
      if (leftUser?.id) {
        await this.cleanupUserData(leftUser.id)
      }

      this.logger.i("✅ Left chat member processing completed")
    } catch (error) {
      this.logger.e("❌ Error handling left chat member:", error)
    }
  }

  /**
   * Обработка изменений участника чата
   */
  async handleChatMember(context: any): Promise<void> {
    try {
      this.logger.i("🔄 Processing chat member update...")

      const chatId = context.chat?.id
      const newChatMember = context.newChatMember
      const oldChatMember = context.oldChatMember

      if (!chatId) {
        this.logger.w("No chat ID in chat member context")
        return
      }

      this.logger.i(`Chat member update - Chat ID: ${chatId}`)
      this.logger.i(`Old status: ${oldChatMember?.status}, New status: ${newChatMember?.status}`)

      // Если пользователь покинул чат или был исключен
      if (newChatMember?.status === "left" || newChatMember?.status === "kicked") {
        const userId = newChatMember.user?.id
        if (userId) {
          this.logger.i(`👋 User ${userId} left/kicked from chat ${chatId}`)
          await this.cleanupUserData(userId)
        }
      }

      this.logger.i("✅ Chat member update processing completed")
    } catch (error) {
      this.logger.e("❌ Error handling chat member update:", error)
    }
  }

  /**
   * Очистка данных пользователя при покидании чата
   */
  private async cleanupUserData(userId: number): Promise<void> {
    try {
      // Удаляем пользователя из ограниченных (капча)
      if (this.captchaService && this.captchaService.isUserRestricted(userId)) {
        this.logger.i(`🧹 Removing user ${userId} from captcha restrictions`)
        this.captchaService.removeRestrictedUser(userId)
      }

      // Удаляем счетчик сообщений пользователя
      const hasCounter = await this.userManager.hasMessageCounter(userId)
      if (hasCounter) {
        await this.userManager.deleteMessageCounter(userId)
        this.logger.i(`🧹 Removed message counter for user ${userId}`)
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
  async getMemberStats(): Promise<{ totalUsers: number, restrictedUsers: number }> {
    const messageCounters = await this.userManager.getMessageCounters()
    const totalUsers = messageCounters.size
    const restrictedUsers = this.captchaService
      ? Array.from(messageCounters.keys()).filter(userId =>
        this.captchaService!.isUserRestricted(userId)).length
      : 0

    return {
      totalUsers,
      restrictedUsers,
    }
  }

  /**
   * Принудительная очистка данных пользователя (для админских команд)
   */
  async forceCleanupUser(userId: number): Promise<boolean> {
    try {
      await this.cleanupUserData(userId)
      this.logger.i(`Force cleanup completed for user ${userId}`)
      return true
    } catch (error) {
      this.logger.e(`Error in force cleanup for user ${userId}:`, error)
      return false
    }
  }
}
