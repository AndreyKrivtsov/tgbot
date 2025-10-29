import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot, TelegramBotSettings, TelegramChatMemberContext, TelegramLeftMemberContext, TelegramNewMembersContext } from "../types/index.js"
import type { EventBus } from "../../../core/EventBus.js"
import { EVENTS } from "../../../core/EventBus.js"
import type { UserManager } from "../utils/UserManager.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"

/**
 * Обработчик событий участников группы
 */
export class MemberHandler {
  private logger: Logger
  private settings: TelegramBotSettings
  private bot?: TelegramBot
  private userManager: UserManager
  private chatRepository: ChatRepository
  private captchaService?: CaptchaService
  private eventBus?: EventBus

  // Кеш для предотвращения дублирования капчи
  private recentlyProcessedUsers = new Map<number, number>() // userId -> timestamp
  private readonly DUPLICATE_PREVENTION_TIMEOUT_MS = 2000 // 10 секунд

  constructor(
    logger: Logger,
    settings: TelegramBotSettings,
    botOrUndefined: TelegramBot | undefined,
    userRestrictions: any,
    userManager: UserManager,
    chatRepository: ChatRepository,
    captchaService?: CaptchaService,
    eventBus?: EventBus,
  ) {
    this.logger = logger
    this.settings = settings
    this.bot = botOrUndefined
    this.userManager = userManager
    this.chatRepository = chatRepository
    this.captchaService = captchaService
    this.eventBus = eventBus
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

    // Инициируем капчу через use-case сервиса
    if (!this.captchaService) {
      this.logger.w("Captcha service not available, skipping captcha initiation")
      return
    }

    this.logger.i(`🔐 Initiating captcha for user ${user.id} via ${eventType} event`)

    try {
      await this.captchaService.startChallenge({
        chatId,
        userId: user.id,
        username: user.username,
        firstName: user.firstName,
      })
    } catch (error) {
      this.logger.e(`❌ Error initiating captcha for user ${user.id}:`, error)
    }
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
   * Только удаление системного сообщения. Вся логика обработки в handleChatMember.
   * Не эмитит событие member.joined, так как оно обрабатывается в handleChatMember.
   */
  async handleNewChatMembers(context: TelegramNewMembersContext): Promise<void> {
    try {
      const chatId = context.chat.id
      const messageId = context.id

      // Удаляем системное сообщение о присоединении
      if (this.settings.deleteSystemMessages && messageId) {
        await this.bot?.deleteMessage(chatId, messageId)
      }
    } catch (error) {
      this.logger.e("❌ Error handling new chat members:", error)
    }
  }

  /**
   * Обработка ушедших участников
   * Только удаление системного сообщения. Вся логика обработки в handleChatMember.
   * Не эмитит событие member.left, так как оно обрабатывается в handleChatMember.
   */
  async handleLeftChatMember(context: TelegramLeftMemberContext): Promise<void> {
    try {
      const chatId = context.chat?.id
      const messageId = context.id

      if (!chatId) {
        return
      }

      // Удаляем системное сообщение о покидании/исключении
      if (this.settings.deleteSystemMessages && messageId) {
        await this.bot?.deleteMessage(chatId, messageId)
      }
    } catch (error) {
      this.logger.e("❌ Error handling left chat member:", error)
    }
  }

  /**
   * Обработка изменений участника чата
   *
   * Централизованная обработка всех изменений статуса участников.
   * События new_chat_members и left_chat_member только удаляют системные сообщения.
   */
  async handleChatMember(context: TelegramChatMemberContext): Promise<void> {
    try {
      const oldMember = context.oldChatMember
      const newMember = context.newChatMember
      const chatId = context.chat?.id

      const validStatuses = [
        "creator",
        "administrator",
        "member",
        "restricted",
        "left",
        "kicked",
      ]

      function isValidStatus(status: string | undefined): boolean {
        return typeof status === "string" && validStatuses.includes(status)
      }

      if (!chatId) {
        return
      }

      // Проверяем активность чата
      const isActive = await this.chatRepository.isChatActive(chatId)
      if (!isActive) {
        return
      }

      // Проверяем валидность статусов
      if (!isValidStatus(oldMember?.status) || !isValidStatus(newMember?.status)) {
        return
      }

      const user = newMember.user
      if (!user) {
        return
      }

      // Пропускаем ботов
      if (user.isBot()) {
        return
      }

      // Пользователь вступил в чат
      if (
        (oldMember.status === "left" || oldMember.status === "kicked" || !oldMember.isMember())
        && (newMember.status === "member" || newMember.status === "restricted")
      ) {
        this.logger.i(`👋 User ${user.id} (@${user.username || "no_username"}) joined chat ${chatId}`)

        // Сохраняем маппинг пользователя
        await this.userManager.saveUserMapping(chatId, user.id, user.username)

        // Эмитим member.joined
        if (this.eventBus) {
          await this.eventBus.emit(EVENTS.MEMBER_JOINED, {
            chatId,
            userId: user.id,
            username: user.username,
            firstName: user.firstName,
          })
        }
        return
      }

      // Пользователь покинул чат
      if (newMember.status === "left" || newMember.status === "kicked" || !newMember.isMember()) {
        this.logger.i(`👋 User ${user.id} left chat ${chatId}`)

        // Эмитим member.left
        if (this.eventBus) {
          await this.eventBus.emit(EVENTS.MEMBER_LEFT, { chatId, userId: user.id })
        }
        return
      }

      // Изменение прав
      if (oldMember.status !== newMember.status) {
        this.logger.d(`⚡ Status change: ${oldMember.status} -> ${newMember.status} for user ${user.id}`)
        // Эмитим member.updated
        if (this.eventBus) {
          await this.eventBus.emit(EVENTS.CHAT_MEMBER_UPDATED, {
            chatId,
            oldStatus: oldMember.status,
            newStatus: newMember.status,
            userId: user.id,
            username: user.username,
          })
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
      if (!this.captchaService) {
        return
      }

      const restrictedUser = this.captchaService.getRestrictedUser(userId)

      let cleanedItems = 0

      // Удаляем пользователя из ограниченных (капча)
      if (restrictedUser) {
        await this.bot?.deleteMessage(restrictedUser.chatId, restrictedUser.questionId)
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
    return !!this.captchaService
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
