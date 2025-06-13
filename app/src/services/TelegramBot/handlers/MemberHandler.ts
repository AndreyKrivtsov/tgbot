import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBotSettings, TelegramChatMemberContext, TelegramLeftMemberContext, TelegramNewMembersContext } from "../types/index.js"
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

  // Кеш для предотвращения дублирования капчи
  private recentlyProcessedUsers = new Map<number, number>() // userId -> timestamp
  private readonly DUPLICATE_PREVENTION_TIMEOUT_MS = 10000 // 10 секунд

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
   * Проверка и инициация капчи с защитой от дублирования
   */
  private async initiateUserCaptchaWithDuplicateCheck(chatId: number, user: any, eventType: string): Promise<void> {
    const now = Date.now()
    const lastProcessed = this.recentlyProcessedUsers.get(user.id)

    // Проверяем, не обрабатывали ли мы этого пользователя недавно
    if (lastProcessed && (now - lastProcessed) < this.DUPLICATE_PREVENTION_TIMEOUT_MS) {
      this.logger.i(`🔄 User ${user.id} already processed recently (${Math.round((now - lastProcessed) / 1000)}s ago), skipping ${eventType} event`)
      return
    }

    // Дополнительная проверка через CaptchaService
    if (this.captchaService?.isUserRestricted(user.id)) {
      this.logger.i(`🔄 User ${user.id} already has active captcha, skipping ${eventType} event`)
      return
    }

    // Обновляем кеш
    this.recentlyProcessedUsers.set(user.id, now)

    // Очищаем старые записи из кеша
    this.cleanupRecentlyProcessedUsers()

    // Инициируем капчу
    this.logger.i(`🔐 Initiating captcha for user ${user.id} via ${eventType} event`)
    await this.captchaManager.initiateUserCaptcha(chatId, user)
  }

  /**
   * Очистка старых записей из кеша
   */
  private cleanupRecentlyProcessedUsers(): void {
    const now = Date.now()
    for (const [userId, timestamp] of this.recentlyProcessedUsers.entries()) {
      if (now - timestamp > this.DUPLICATE_PREVENTION_TIMEOUT_MS) {
        this.recentlyProcessedUsers.delete(userId)
      }
    }
  }

  /**
   * Обработка новых участников
   */
  async handleNewChatMembers(context: TelegramNewMembersContext): Promise<void> {
    try {
      // Диагностическое логирование
      this.logger.i("🔥 NEW_CHAT_MEMBERS event handler called!")
      this.logger.i(`Context type: ${typeof context}`)
      this.logger.i(`Context keys: ${Object.keys(context)}`)

      const chatId = context.chat.id
      this.logger.i(`Chat ID: ${chatId}`)

      // Проверяем, есть ли чат в базе данных
      const chatExists = await this.chatRepository.chatExists(chatId)
      this.logger.i(`Chat exists in DB: ${chatExists}`)

      if (!chatExists) {
        this.logger.w(`Chat ${chatId} not found in database, skipping new members processing`)
        return
      }

      const newMembers = context.newChatMembers
      const messageId = (context as any).messageId || (context as any).message_id || context.id

      this.logger.i(`New members count: ${newMembers?.length || 0}`)
      this.logger.i(`Message ID: ${messageId}`)
      this.logger.i(`CaptchaManager available: ${this.captchaManager ? "YES" : "NO"}`)

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

          // Логируем каждого пользователя
          realUsers.forEach((user: any, index: number) => {
            this.logger.i(`Real user ${index + 1}: ${user.firstName || "NoName"} (ID: ${user.id}, @${user.username || "no_username"})`)
          })
        }

        if (bots.length > 0) {
          this.logger.d(`🤖 Skipping ${bots.length} bots`)
        }

        for (const user of realUsers) {
          this.logger.i(`🔐 Initiating captcha for user ${user.id}`)
          await this.initiateUserCaptchaWithDuplicateCheck(chatId, user, "NEW_CHAT_MEMBERS")
        }
      } else {
        this.logger.w("No new members found in context!")
      }

      this.logger.i("✅ handleNewChatMembers completed")
    } catch (error) {
      this.logger.e("❌ Error handling new chat members:", error)
    }
  }

  /**
   * Обработка ушедших участников
   */
  async handleLeftChatMember(context: TelegramLeftMemberContext): Promise<void> {
    try {
      const chatId = context.chat?.id
      const leftUser = context.leftChatMember
      const messageId = context.id

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
  async handleChatMember(context: TelegramChatMemberContext): Promise<void> {
    try {
      const chatId = context.chat?.id
      const newChatMember = context.newChatMember
      const oldChatMember = context.oldChatMember

      if (!chatId) {
        this.logger.w("No chat ID in chat member context")
        return
      }

      this.logger.i(`🔄 CHAT_MEMBER event: ${oldChatMember?.status} -> ${newChatMember?.status}`)
      this.logger.i(`🔄 CHAT_MEMBER event: ${oldChatMember.isMember()} -> ${newChatMember.isMember()}`)

      // Проверяем, есть ли чат в базе данных
      const chatExists = await this.chatRepository.chatExists(chatId)
      if (!chatExists) {
        this.logger.w(`Chat ${chatId} not found in database, skipping chat member processing`)
        return
      }

      // Если пользователь покинул чат или был исключен
      if ((newChatMember?.status === "left" || newChatMember?.status === "kicked") || !newChatMember.isMember()) {
        const userId = newChatMember.user?.id
        if (userId) {
          this.logger.i(`👋 User ${userId} left/kicked from chat ${chatId}`)
          await this.cleanupUserData(userId)
        }
      }
      // Если пользователь присоединился к чату (новый участник)
      else if (
        (oldChatMember?.status === "left" || oldChatMember?.status === "kicked")
        || (!oldChatMember.isMember() && newChatMember.isMember())
      ) {
        const user = newChatMember.user
        if (user && !user.isBot()) {
          this.logger.i(`🎯 New member detected via chat_member event: ${user.firstName || "NoName"} (ID: ${user.id}, @${user.username || "no_username"})`)

          // Показываем капчу новому пользователю (та же логика что в handleNewChatMembers)
          this.logger.i(`🔐 Initiating captcha for user ${user.id} via chat_member event`)

          // Передаем пользователя напрямую как в handleNewChatMembers
          await this.initiateUserCaptchaWithDuplicateCheck(chatId, user as any, "CHAT_MEMBER")
        } else if (user?.isBot()) {
          this.logger.d(`🤖 Skipping bot ${user.firstName} (ID: ${user.id})`)
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
