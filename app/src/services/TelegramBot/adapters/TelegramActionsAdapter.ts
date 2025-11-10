import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import type { EventBus, TelegramAction } from "../../../core/EventBus.js"

/**
 * Адаптер для выполнения Telegram действий на основе событий
 * Содержит только инфраструктурную логику (КАК выполнять действия)
 * Бизнес-логика (ЧТО делать) остается в сервисах
 */
export class TelegramActionsAdapter {
  constructor(
    private bot: TelegramBot,
    private logger: Logger,
    private eventBus: EventBus,
  ) {}

  /**
   * Инициализация адаптера - подписка на события
   */
  initialize(): void {
    this.logger.i("🔌 Initializing TelegramActionsAdapter...")

    // Подписываемся на события капчи
    this.eventBus.onCaptchaPassed(async (event) => {
      try {
        await this.executeActions(event.chatId, event.actions)
      } catch (error) {
        this.logger.e("Error handling captcha passed:", error)
      }
    })

    this.eventBus.onCaptchaFailed(async (event) => {
      try {
        await this.executeActions(event.chatId, event.actions)
      } catch (error) {
        this.logger.e("Error handling captcha failed:", error)
      }
    })

    // Подписываемся на события captcha challenge
    this.eventBus.on("captcha.challenge", async (event: any) => {
      try {
        await this.executeCaptchaChallengeActions(event)
      } catch (error) {
        this.logger.e("Error handling captcha challenge:", error)
      }
    })

    // Подписываемся на события антиспама
    this.eventBus.onSpamDetected(async (event) => {
      try {
        await this.executeActions(event.chatId, event.actions)
      } catch (error) {
        this.logger.e("Error handling spam detected:", error)
      }
    })

    // Подписываемся на события AI ответов
    this.eventBus.onAIResponse(async (event) => {
      try {
        await this.executeActions(event.chatId, event.actions)
      } catch (error) {
        this.logger.e("Error handling AI response:", error)
      }
    })

    this.logger.i("✅ TelegramActionsAdapter initialized")
  }

  /**
   * Выполнение действий для captcha challenge с сохранением messageId
   */
  private async executeCaptchaChallengeActions(event: any): Promise<void> {
    const { chatId, userId, actions } = event
    let captchaMessageId: number | undefined

    for (const action of actions) {
      try {
        if (action.type === "sendMessage") {
          // Отправляем сообщение и сохраняем messageId
          captchaMessageId = await this.sendMessageAndGetId(chatId, action.params)
        } else {
          await this.executeAction(chatId, action)
        }
      } catch (error) {
        this.logger.e(`Error executing action ${action.type}:`, error)
      }
    }

    // Эмитим событие с messageId для обновления CaptchaService
    if (captchaMessageId) {
      try {
        await this.eventBus.emitCaptchaMessageSent({
          chatId,
          userId,
          messageId: captchaMessageId,
        })
      } catch (error) {
        this.logger.e("Error emitting captcha message sent event:", error)
      }
    }
  }

  /**
   * Выполнение списка действий
   */
  private async executeActions(chatId: number, actions: TelegramAction[]): Promise<void> {
    for (const action of actions) {
      try {
        await this.executeAction(chatId, action)
      } catch (error) {
        this.logger.e(`Error executing action ${action.type}:`, error)
      }
    }
  }

  /**
   * Выполнение одного действия
   */
  private async executeAction(chatId: number, action: TelegramAction): Promise<void> {
    switch (action.type) {
      case "unrestrict":
        await this.unrestrict(chatId, action.params)
        break
      case "restrict":
        await this.restrict(chatId, action.params)
        break
      case "ban":
        await this.ban(chatId, action.params)
        break
      case "unban":
        await this.unban(chatId, action.params)
        break
      case "kick":
        await this.kick(chatId, action.params)
        break
      case "deleteMessage":
        await this.deleteMessage(chatId, action.params)
        break
      case "sendMessage":
        await this.sendMessage(chatId, action.params)
        break
      default:
        this.logger.w(`Unknown action type: ${(action as any).type}`)
    }
  }

  /**
   * Снятие ограничений с пользователя
   */
  private async unrestrict(chatId: number, params: any): Promise<void> {
    const permissions = params.permissions === "full"
      ? {
          can_send_messages: true,
          can_send_audios: true,
          can_send_documents: true,
          can_send_photos: true,
          can_send_videos: true,
          can_send_video_notes: true,
          can_send_voice_notes: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: true,
          can_pin_messages: false,
        }
      : params.permissions

    await this.bot.api.restrictChatMember({
      chat_id: chatId,
      user_id: params.userId,
      permissions,
    })

    this.logger.i(`User ${params.userId} unrestricted in chat ${chatId}`)
  }

  /**
   * Ограничение пользователя
   */
  private async restrict(chatId: number, params: any): Promise<void> {
    const permissions = params.permissions === "none"
      ? {
          can_send_messages: false,
          can_send_audios: false,
          can_send_documents: false,
          can_send_photos: false,
          can_send_videos: false,
          can_send_video_notes: false,
          can_send_voice_notes: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
        }
      : params.permissions

    await this.bot.api.restrictChatMember({
      chat_id: chatId,
      user_id: params.userId,
      permissions,
    })

    this.logger.i(`User ${params.userId} restricted in chat ${chatId}`)
  }

  /**
   * Бан пользователя
   */
  private async ban(chatId: number, params: any): Promise<void> {
    const banParams: any = {
      chat_id: chatId,
      user_id: params.userId,
    }

    if (params.durationSec) {
      banParams.until_date = Math.floor(Date.now() / 1000) + params.durationSec
    }

    await this.bot.api.banChatMember(banParams)

    this.logger.i(
      `User ${params.userId} banned in chat ${chatId}${params.durationSec ? ` for ${params.durationSec}s` : " permanently"}`,
    )
  }

  /**
   * Разбан пользователя
   */
  private async unban(chatId: number, params: any): Promise<void> {
    await this.bot.api.unbanChatMember({
      chat_id: chatId,
      user_id: params.userId,
    })

    this.logger.i(`User ${params.userId} unbanned in chat ${chatId}`)
  }

  /**
   * Кик пользователя (бан с автоматическим разбаном)
   */
  private async kick(chatId: number, params: any): Promise<void> {
    await this.bot.api.banChatMember({
      chat_id: chatId,
      user_id: params.userId,
    })

    // Счетчики очищаются автоматически через TTL в Redis
    // clearCounter параметр игнорируется

    this.logger.i(`User ${params.userId} kicked from chat ${chatId}`)
  }

  /**
   * Удаление сообщения
   */
  private async deleteMessage(chatId: number, params: any): Promise<void> {
    if (!params.messageId) {
      this.logger.w("deleteMessage: messageId is missing")
      return
    }

    await this.bot.deleteMessage(chatId, params.messageId)
    this.logger.d(`Message ${params.messageId} deleted from chat ${chatId}`)
  }

  /**
   * Отправка сообщения с возвратом messageId
   */
  private async sendMessageAndGetId(chatId: number, params: any): Promise<number> {
    const messageParams: any = {
      chat_id: chatId,
      text: params.text,
    }

    if (params.replyToMessageId) {
      messageParams.reply_to_message_id = params.replyToMessageId
    }

    if (params.parseMode) {
      messageParams.parse_mode = params.parseMode
    }

    if (params.inlineKeyboard) {
      messageParams.reply_markup = {
        inline_keyboard: params.inlineKeyboard,
      }
    }

    let result: any
    if (params.autoDelete && params.autoDelete > 0) {
      // Используем метод с автоудалением
      result = await this.bot.sendGroupMessage(messageParams, params.autoDelete)
    } else {
      result = await this.bot.sendMessage(messageParams)
    }

    this.logger.d(`Message sent to chat ${chatId}`)
    return result.message_id
  }

  /**
   * Отправка сообщения
   */
  private async sendMessage(chatId: number, params: any): Promise<void> {
    const messageParams: any = {
      chat_id: chatId,
      text: params.text,
    }

    if (params.replyToMessageId) {
      messageParams.reply_to_message_id = params.replyToMessageId
    }

    if (params.parseMode) {
      messageParams.parse_mode = params.parseMode
    }

    if (params.inlineKeyboard) {
      messageParams.reply_markup = {
        inline_keyboard: params.inlineKeyboard,
      }
    }

    if (params.autoDelete && params.autoDelete > 0) {
      // Используем метод с автоудалением
      await this.bot.sendGroupMessage(messageParams, params.autoDelete)
    } else {
      await this.bot.sendMessage(messageParams)
    }

    this.logger.d(`Message sent to chat ${chatId}`)
  }
}
