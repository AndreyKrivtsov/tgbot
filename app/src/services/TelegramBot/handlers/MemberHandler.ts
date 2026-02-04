import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot, TelegramBotSettings, TelegramChatMemberContext, TelegramLeftMemberContext, TelegramNewMembersContext } from "../types/index.js"
import type { EventBus } from "../../../core/EventBus.js"
import { EVENTS } from "../../../core/EventBus.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"

/**
 * Обработчик событий участников группы
 */
export class MemberHandler {
  private logger: Logger
  private settings: TelegramBotSettings
  private bot?: TelegramBot
  private chatRepository: ChatRepository
  private captchaService?: CaptchaService
  private eventBus?: EventBus
  constructor(
    logger: Logger,
    settings: TelegramBotSettings,
    botOrUndefined: TelegramBot | undefined,
    userRestrictions: any,
    chatRepository: ChatRepository,
    captchaService?: CaptchaService,
    eventBus?: EventBus,
  ) {
    this.logger = logger
    this.settings = settings
    this.bot = botOrUndefined
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

      this.logger.d(`🔍 User ${user.id} status: ${newMember.status}`)
      this.logger.d(`🔍 User ${user.id} old status: ${oldMember.status}`)
      this.logger.d(`🔍 User ${user.id} is member: ${newMember.isMember()}`)
      this.logger.d(`🔍 User ${user.id} is old member: ${oldMember.isMember()}`)

      // Пользователь вступил в чат
      if (
        (!oldMember.isMember() || oldMember.status === "left" || oldMember.status === "kicked")
        && (newMember.isMember() || newMember.status === "member" || newMember.status === "administrator" || newMember.status === "creator")
      ) {
        await this.handleMemberJoined(chatId, user)
        return
      }

      // Пользователь покинул чат
      if (
        (!newMember.isMember() || newMember.status === "left" || newMember.status === "kicked")
        && (oldMember.isMember())
      ) {
        await this.handleMemberLeft(chatId, user.id)
        return
      }

      // Изменение прав
      if (oldMember.status !== newMember.status) {
        await this.handleChatMemberStatusChanged({
          chatId,
          userId: user.id,
          username: user.username,
          oldStatus: oldMember.status,
          newStatus: newMember.status,
        })
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

  private async handleMemberJoined(chatId: number, user: { id: number, username?: string, firstName?: string }): Promise<void> {
    this.logger.i(`👋 User ${user.id} (@${user.username || "no_username"}) joined chat ${chatId}`)

    // Эмитим member.joined
    if (this.eventBus) {
      await this.eventBus.emit(EVENTS.MEMBER_JOINED, {
        chatId,
        userId: user.id,
        username: user.username,
        firstName: user.firstName,
      })
    }
  }

  private async handleMemberLeft(chatId: number, userId: number): Promise<void> {
    this.logger.i(`👋 User ${userId} left chat ${chatId}`)

    // Эмитим member.left
    if (this.eventBus) {
      await this.eventBus.emit(EVENTS.MEMBER_LEFT, { chatId, userId })
    }
  }

  private async handleChatMemberStatusChanged(params: {
    chatId: number
    userId: number
    username?: string
    oldStatus: string
    newStatus: string
  }): Promise<void> {
    this.logger.d(`⚡ Status change: ${params.oldStatus} -> ${params.newStatus} for user ${params.userId}`)
    // Эмитим member.updated
    if (this.eventBus) {
      await this.eventBus.emit(EVENTS.CHAT_MEMBER_UPDATED, {
        chatId: params.chatId,
        oldStatus: params.oldStatus,
        newStatus: params.newStatus,
        userId: params.userId,
        username: params.username,
      })
    }
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
