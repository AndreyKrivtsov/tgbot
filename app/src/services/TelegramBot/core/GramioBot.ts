import { Bot } from "gramio"
import type { MessageContext, NewChatMembersContext } from "gramio"
import type { Logger } from "../../../helpers/Logger.js"
import { BOT_CONFIG } from "../../../constants.js"
import type { MessageDeletionManager } from "../utils/MessageDeletionManager.js"
import { MessageFormatter } from "../utils/MessageFormatter.js"

/**
 * Обертка для библиотеки GramIO с минималистичным API
 * Предоставляет только методы, используемые в приложении
 */
export class GramioBot {
  private bot: Bot
  private logger: Logger
  private autoDeleteTimers = new Map<number, NodeJS.Timeout>() // Fallback для старой логики
  private deletionManager?: MessageDeletionManager

  constructor(token: string, logger: Logger, deletionManager?: MessageDeletionManager) {
    this.bot = new Bot(token)
    this.logger = logger
    this.deletionManager = deletionManager
  }

  /**
   * Регистрация обработчика событий
   */
  on<T extends keyof Events>(event: T, handler: (context: Events[T]) => void | Promise<void>): void {
    this.bot.on(event, handler)
  }

  /**
   * Запуск бота с настройкой allowed_updates для получения событий участников
   * При ошибке подключения повторяет попытку каждую секунду
   */
  async start(): Promise<void> {
    let attempt = 0

    while (true) {
      attempt++

      try {
        // Настраиваем allowed_updates для получения всех необходимых событий
        const allowedUpdates = [
          "message",
          "edited_message",
          "callback_query",
          "chat_member",
          "left_chat_member",
          "my_chat_member",
        ]

        this.logger.i(`🔧 [Attempt ${attempt}] Configuring bot...`)

        // Очищаем webhook и настраиваем getUpdates с allowed_updates
        await this.bot.api.deleteWebhook({ drop_pending_updates: true })

        // Настраиваем allowed_updates через getUpdates
        await this.bot.api.getUpdates({
          allowed_updates: allowedUpdates as any,
          limit: 1,
          timeout: 1,
        })

        await this.bot.start()

        this.logger.i("✅ Bot started successfully")
        return
      } catch (error: any) {
        this.logger.w(`⚠️ Failed to start bot. Retrying in 1 second...`, error)
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }

  /**
   * Остановка бота
   */
  async stop(): Promise<void> {
    // Очищаем fallback таймеры (MessageDeletionManager управляется отдельно)
    for (const timer of this.autoDeleteTimers.values()) {
      clearTimeout(timer)
    }
    this.autoDeleteTimers.clear()

    await this.bot.stop()
  }

  /**
   * Получение информации о боте
   * При ошибке подключения повторяет попытку каждую секунду
   */
  async getMe() {
    let attempt = 0
    const startTime = Date.now()

    while (true) {
      attempt++

      try {
        if (attempt === 1) {
          this.logger.i(`🔍 Getting bot info...`)
        } else {
          const elapsed = Math.floor((Date.now() - startTime) / 1000)
          this.logger.w(`⚠️ [Attempt ${attempt}] Retrying to get bot info... (elapsed: ${elapsed}s)`)
        }

        const botInfo = await this.bot.api.getMe()
        const elapsed = Math.floor((Date.now() - startTime) / 1000)
        this.logger.i(`✅ Bot info retrieved successfully (${elapsed}s, ${attempt} attempt${attempt > 1 ? "s" : ""})`)
        return botInfo
      } catch (error: any) {
        // Проверяем, является ли это сетевой ошибкой
        const isNetworkError = error?.cause?.code === "UND_ERR_CONNECT_TIMEOUT"
          || error?.code === "UND_ERR_CONNECT_TIMEOUT"
          || error?.message?.includes("fetch failed")
          || error?.message?.includes("timeout")

        if (isNetworkError) {
          // Логируем детали ошибки только на первых попытках и периодически
          if (attempt === 1 || attempt % 10 === 0) {
            const elapsed = Math.floor((Date.now() - startTime) / 1000)
            const errorCode = error?.cause?.code || error?.code || "UNKNOWN"
            this.logger.w(`⚠️ Network error (${errorCode}) on attempt ${attempt} (${elapsed}s elapsed). Retrying...`)
          }
          await new Promise(resolve => setTimeout(resolve, 1000))
        } else {
          // Если это не сетевая ошибка, логируем детали и пробрасываем дальше
          const elapsed = Math.floor((Date.now() - startTime) / 1000)
          this.logger.e(`❌ Non-network error after ${attempt} attempt(s) (${elapsed}s elapsed):`, error)
          throw error
        }
      }
    }
  }

  /**
   * Отправка обычного сообщения
   */
  async sendMessage(params: SendMessageParams): Promise<MessageResult> {
    let text = params.text
    const parse_mode = params.parse_mode ?? "MarkdownV2"
    if (parse_mode === "MarkdownV2") {
      text = MessageFormatter.escapeMarkdownV2(text)
    } else if (parse_mode === "Markdown") {
      text = MessageFormatter.escapeMarkdown(text)
    }
    return await this.bot.api.sendMessage({
      ...params,
      text,
      parse_mode,
      disable_notification: true,
      link_preview_options: { is_disabled: true },
    })
  }

  /**
   * Отправка сообщения с автоудалением через заданное время
   */
  async sendAutoDeleteMessage(
    params: SendMessageParams,
    deleteAfterMs: number,
  ): Promise<MessageResult> {
    const result = await this.bot.api.sendMessage({ ...params, disable_notification: true, link_preview_options: { is_disabled: true } })

    // Используем новый менеджер удалений если доступен
    if (this.deletionManager) {
      try {
        await this.deletionManager.scheduleDeletion(params.chat_id, result.message_id, deleteAfterMs)
      } catch (error) {
        this.logger.e(`❌ Failed to schedule deletion via MessageDeletionManager for message ${result.message_id}:`, error)
        // Fallback на старый метод
        this.scheduleOldStyleDeletion(params.chat_id, result.message_id, deleteAfterMs)
      }
    } else {
      // Fallback на старую логику с таймерами
      this.logger.w(`⚠️ MessageDeletionManager not available, using fallback timer for message ${result.message_id}`)
      this.scheduleOldStyleDeletion(params.chat_id, result.message_id, deleteAfterMs)
    }

    return result
  }

  /**
   * Fallback метод для старой логики удаления через таймеры
   */
  private scheduleOldStyleDeletion(chatId: number, messageId: number, deleteAfterMs: number): void {
    const timer = setTimeout(() => {
      this.deleteMessage(chatId, messageId)
        .catch((error) => {
          this.logger.w(`Failed to auto-delete message ${messageId}:`, error)
        })
        .finally(() => {
          this.autoDeleteTimers.delete(messageId)
        })
    }, deleteAfterMs)

    this.autoDeleteTimers.set(messageId, timer)
  }

  /**
   * Удаление сообщения
   */
  async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      await this.bot.api.deleteMessage({
        chat_id: chatId,
        message_id: messageId,
      })
    } catch (error) {
      // Не прерываем выполнение, если сообщение уже удалено
      this.logger.d(`Message ${messageId} deletion failed (might be already deleted):`, error)
    }
  }

  /**
   * Отправка действия в чат (typing, uploading_photo, etc.)
   */
  async sendChatAction(chatId: number, action: ChatAction): Promise<void> {
    await this.bot.api.sendChatAction({
      chat_id: chatId,
      action,
    })
  }

  /**
   * Ограничение пользователя (мьют) с обязательными параметрами
   */
  async restrictUser(chatId: number, userId: number, permissions: ChatPermissions, untilDate?: number): Promise<void> {
    await this.bot.api.restrictChatMember({
      chat_id: chatId,
      user_id: userId,
      permissions,
      until_date: untilDate,
    })
  }

  /**
   * Снятие ограничений с пользователя с обязательными параметрами
   */
  async unrestrictUser(chatId: number, userId: number, permissions: ChatPermissions): Promise<void> {
    await this.bot.api.restrictChatMember({
      chat_id: chatId,
      user_id: userId,
      permissions,
    })
  }

  async muteUser(
    chatId: number,
    userId: number,
    durationMinutes?: number,
    permissions: ChatPermissions = {
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
    },
  ): Promise<void> {
    const untilDate = typeof durationMinutes === "number" && durationMinutes > 0
      ? Math.floor(Date.now() / 1000) + Math.floor(durationMinutes * 60)
      : undefined

    await this.restrictUser(chatId, userId, permissions, untilDate)
  }

  async unmuteUser(
    chatId: number,
    userId: number,
    permissions: ChatPermissions = {
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
    },
  ): Promise<void> {
    await this.unrestrictUser(chatId, userId, permissions)
  }

  /**
   * Бан пользователя
   */
  async banUser(chatId: number, userId: number, untilDate?: number): Promise<void> {
    await this.bot.api.banChatMember({
      chat_id: chatId,
      user_id: userId,
      until_date: untilDate,
    })
  }

  /**
   * Разбан пользователя
   */
  async unbanUser(chatId: number, userId: number): Promise<void> {
    await this.bot.api.unbanChatMember({
      chat_id: chatId,
      user_id: userId,
    })
  }

  /**
   * Кик пользователя (бан + автоматический разбан)
   */
  async kickUser(chatId: number, userId: number, autoUnbanDelayMs = 5000): Promise<void> {
    // Расчет страховочного времени: максимум из autoUnbanDelayMs и 40 секунд
    const minSafetyMs = 40 * 1000 // 40 секунд в миллисекундах
    const safetyDelayMs = Math.max(autoUnbanDelayMs, minSafetyMs)
    const safetyUntilDate = Math.floor(Date.now() / 1000) + Math.floor(safetyDelayMs / 1000)

    // Баним пользователя со страховочным until_date
    await this.banUser(chatId, userId, safetyUntilDate)

    // Автоматически разбаниваем через задержку
    setTimeout(async () => {
      try {
        await this.unbanUser(chatId, userId)
        this.logger.d(`User ${userId} unbanned after kick`)
      } catch (error) {
        this.logger.e(`Failed to unban user ${userId} after kick:`, error)
      }
    }, autoUnbanDelayMs)
  }

  /**
   * Отправка сообщения с автоудалением в групповых чатах
   * В приватных чатах (chatId > 0) сообщения НЕ удаляются
   * В групповых чатах (chatId < 0) сообщения удаляются через заданное время
   */
  async sendGroupMessage(
    params: SendMessageParams,
    deleteAfterMs: number = BOT_CONFIG.MESSAGE_DELETE_LONG_TIMEOUT_MS, // 60 секунд по умолчанию
  ): Promise<MessageResult> {
    // Если это приватный чат (положительный ID), отправляем обычное сообщение
    if (params.chat_id > 0) {
      return await this.sendMessage(params)
    }

    // Если это групповой чат (отрицательный ID), отправляем с автоудалением
    return await this.sendAutoDeleteMessage(params, deleteAfterMs)
  }

  /**
   * Получить администраторов чата
   */
  async getChatAdministrators(chatId: number): Promise<any[]> {
    return await this.bot.api.getChatAdministrators({ chat_id: chatId })
  }

  /**
   * Получить информацию об участнике чата (обертка над getChatMember)
   */
  async getChatMember(params: { chat_id: number, user_id: number | string }): Promise<any> {
    return await this.bot.api.getChatMember(params as any)
  }

  /**
   * Получить информацию о чате (обертка над getChat)
   */
  async getChat(params: { chat_id: number | string }): Promise<any> {
    return await this.bot.api.getChat(params as any)
  }

  /**
   * Обновление inline клавиатуры сообщения
   */
  async editMessageReplyMarkup(params: { chat_id: number, message_id: number, reply_markup: { inline_keyboard: any[][] } }): Promise<any> {
    return await this.bot.api.editMessageReplyMarkup(params as any)
  }

  /**
   * Получение прямого доступа к API (для случаев, не покрытых оберткой)
   */
  get api() {
    return this.bot.api
  }
}

// Типы для параметров
interface SendMessageParams {
  chat_id: number
  text: string
  parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
  reply_parameters?: {
    message_id: number
  }
  reply_markup?: {
    inline_keyboard: any[][]
  }
}

interface MessageResult {
  message_id: number
  // Другие поля результата отправки сообщения
}

interface ChatPermissions {
  can_send_messages?: boolean
  can_send_audios?: boolean
  can_send_documents?: boolean
  can_send_photos?: boolean
  can_send_videos?: boolean
  can_send_video_notes?: boolean
  can_send_voice_notes?: boolean
  can_send_polls?: boolean
  can_send_other_messages?: boolean
  can_add_web_page_previews?: boolean
  can_change_info?: boolean
  can_invite_users?: boolean
  can_pin_messages?: boolean
  can_manage_topics?: boolean
}

type ChatAction = "typing" | "upload_photo" | "record_video" | "upload_video" | "record_voice" | "upload_voice" | "upload_document" | "choose_sticker" | "find_location" | "record_video_note" | "upload_video_note"

// Типы событий
interface Events {
  message: MessageContext<Bot>
  new_chat_members: NewChatMembersContext<Bot>
  left_chat_member: any
  chat_member: any
  callback_query: any
}
