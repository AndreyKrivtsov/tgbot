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
}
