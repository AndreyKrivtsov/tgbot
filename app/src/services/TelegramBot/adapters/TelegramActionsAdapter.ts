import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import type {
  EventBus,
  GroupAgentModerationEvent,
  GroupAgentResponseEvent,
  GroupAgentTypingEvent,
  TelegramAction,
} from "../../../core/EventBus.js"

/**
 * Адаптер для выполнения Telegram действий на основе событий
 * Содержит только инфраструктурную логику (КАК выполнять действия)
 * Бизнес-логика (ЧТО делать) остается в сервисах
 */
export class TelegramActionsAdapter {
  private typingIntervals: Map<number, NodeJS.Timeout> = new Map()

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

    // События нового GroupAgent сервиса
    this.eventBus.onGroupAgentModerationAction(async (event) => {
      try {
        const actions = this.convertGroupAgentModerationEvent(event)
        if (actions.length > 0) {
          await this.executeActions(event.chatId, actions)
        }
      } catch (error) {
        this.logger.e("Error handling group agent moderation action:", error)
      }
    })

    this.eventBus.onGroupAgentResponse(async (event) => {
      try {
        const actions = this.convertGroupAgentResponseEvent(event)
        if (actions.length > 0) {
          await this.executeActions(event.chatId, actions)
        }
      } catch (error) {
        this.logger.e("Error handling group agent response:", error)
      }
    })

    this.eventBus.onGroupAgentTypingStarted(async (event: GroupAgentTypingEvent) => {
      this.startTyping(event.chatId)
    })

    this.eventBus.onGroupAgentTypingStopped(async (event: GroupAgentTypingEvent) => {
      this.stopTyping(event.chatId)
    })

    this.eventBus.onGroupAgentReviewPrompt(async (event) => {
      try {
        const messageId = await this.sendMessageAndGetId(event.chatId, {
          text: event.text,
          inlineKeyboard: event.inlineKeyboard,
        })
        await this.eventBus.emitGroupAgentReviewPromptSent({
          reviewId: event.reviewId,
          chatId: event.chatId,
          messageId,
        })
      } catch (error) {
        this.logger.e("Error handling group agent review prompt:", error)
      }
    })

    this.eventBus.onGroupAgentReviewDeletePrompt(async (event) => {
      try {
        await this.deleteMessage(event.chatId, { messageId: event.messageId })
      } catch (error) {
        this.logger.e("Error deleting review prompt message:", error)
      }
    })

    this.eventBus.onGroupAgentReviewDisablePrompt(async (event) => {
      try {
        await this.removeInlineKeyboard(event.chatId, event.messageId)
      } catch (error) {
        this.logger.e("Error disabling review prompt:", error)
      }
    })

    this.logger.i("✅ TelegramActionsAdapter initialized")
  }

  private convertGroupAgentModerationEvent(event: GroupAgentModerationEvent): TelegramAction[] {
    return event.actions.flatMap(action => this.mapModerationAction(action))
  }

  private mapModerationAction(action: GroupAgentModerationEvent["actions"][number]): TelegramAction[] {
    switch (action.type) {
      case "deleteMessage":
        if (!action.messageId) {
          return []
        }
        return [{
          type: "deleteMessage",
          params: { messageId: action.messageId },
        }]
      case "warn":
        return []
      case "mute":
        return [
          {
            type: "restrict",
            params: {
              userId: action.userId,
              permissions: "none",
              durationMinutes: action.duration,
            },
          },
        ]
      case "unmute":
        return [
          {
            type: "unrestrict",
            params: {
              userId: action.userId,
              permissions: "full",
            },
          },
        ]
      case "kick":
        return [
          {
            type: "kick",
            params: { userId: action.userId },
          },
        ]
      case "ban":
        return [
          {
            type: "ban",
            params: { userId: action.userId },
          },
        ]
      case "unban":
        return [
          {
            type: "unban",
            params: { userId: action.userId },
          },
        ]
      default:
        return []
    }
  }

  private convertGroupAgentResponseEvent(event: GroupAgentResponseEvent): TelegramAction[] {
    return event.actions.map(action => ({
      type: "sendMessage",
      params: {
        text: action.text,
        replyToMessageId: action.replyToMessageId,
      },
    }))
  }

  private startTyping(chatId: number): void {
    if (this.typingIntervals.has(chatId)) {
      return
    }

    const send = () => {
      void this.bot.sendChatAction(chatId, "typing").catch(() => {})
    }

    send()
    const intervalId = setInterval(send, 4000)
    this.typingIntervals.set(chatId, intervalId)
  }

  private stopTyping(chatId: number): void {
    const intervalId = this.typingIntervals.get(chatId)
    if (!intervalId) {
      return
    }
    clearInterval(intervalId)
    this.typingIntervals.delete(chatId)
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
    if (params.permissions && params.permissions !== "full") {
      await this.bot.unrestrictUser(chatId, params.userId, params.permissions)
      this.logger.i(`User ${params.userId} unrestricted in chat ${chatId}`)
      return
    }

    await this.bot.unmuteUser(chatId, params.userId)

    this.logger.i(`User ${params.userId} unrestricted in chat ${chatId}`)
  }

  /**
   * Ограничение пользователя
   */
  private async restrict(chatId: number, params: any): Promise<void> {
    if (params.permissions && params.permissions !== "none") {
      const untilDate = typeof params.untilDate === "number" ? params.untilDate : undefined
      await this.bot.restrictUser(chatId, params.userId, params.permissions, untilDate)
      this.logger.i(`User ${params.userId} restricted in chat ${chatId}`)
      return
    }

    await this.bot.muteUser(chatId, params.userId, params.durationMinutes)

    this.logger.i(`User ${params.userId} muted in chat ${chatId}`)
  }

  /**
   * Бан пользователя
   */
  private async ban(chatId: number, params: any): Promise<void> {
    let untilDate: number | undefined
    if (params.durationSec) {
      untilDate = Math.floor(Date.now() / 1000) + params.durationSec
    }

    await this.bot.banUser(chatId, params.userId, untilDate)

    this.logger.i(
      `User ${params.userId} banned in chat ${chatId}${params.durationSec ? ` for ${params.durationSec}s` : " permanently"}`,
    )
  }

  /**
   * Разбан пользователя
   */
  private async unban(chatId: number, params: any): Promise<void> {
    await this.bot.unbanUser(chatId, params.userId)

    this.logger.i(`User ${params.userId} unbanned in chat ${chatId}`)
  }

  /**
   * Кик пользователя (бан с автоматическим разбаном)
   */
  private async kick(chatId: number, params: any): Promise<void> {
    const autoUnbanDelayMs = typeof params.autoUnbanDelayMs === "number" ? params.autoUnbanDelayMs : undefined

    await this.bot.kickUser(chatId, params.userId, autoUnbanDelayMs)

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

  private async removeInlineKeyboard(chatId: number, messageId: number): Promise<void> {
    try {
      await this.bot.api.editMessageReplyMarkup({
        chat_id: chatId,
        message_id: messageId,
        reply_markup: { inline_keyboard: [] },
      })
    } catch (error) {
      this.logger.e(`Error removing inline keyboard for message ${messageId} in chat ${chatId}:`, error)
    }
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
        inline_keyboard: this.normalizeInlineKeyboard(params.inlineKeyboard),
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
        inline_keyboard: this.normalizeInlineKeyboard(params.inlineKeyboard),
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

  private normalizeInlineKeyboard(
    inlineKeyboard: Array<Array<Record<string, any>>>,
  ): Array<Array<Record<string, any>>> {
    return inlineKeyboard.map(row =>
      row.map((button) => {
        if ("callbackData" in button) {
          const typedButton = button as Record<string, any>
          const { callbackData, ...rest } = typedButton
          return {
            ...rest,
            callback_data: callbackData,
          }
        }
        return button
      }),
    )
  }
}
