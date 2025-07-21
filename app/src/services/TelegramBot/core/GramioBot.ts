import { Bot } from "gramio"
import type { MessageContext, NewChatMembersContext } from "gramio"
import type { Logger } from "../../../helpers/Logger.js"
import { BOT_CONFIG } from "../../../constants.js"
import type { MessageDeletionManager } from "../features/MessageDeletionManager.js"
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
   */
  async start(): Promise<void> {
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

      this.logger.i("🔧 Configuring bot with allowed_updates:", allowedUpdates)

      // Очищаем webhook и настраиваем getUpdates с allowed_updates
      await this.bot.api.deleteWebhook({ drop_pending_updates: true })

      // Настраиваем allowed_updates через getUpdates
      await this.bot.api.getUpdates({
        allowed_updates: allowedUpdates as any,
        limit: 1,
        timeout: 1,
      })

      this.logger.i("✅ Bot configured with allowed_updates successfully")

      await this.bot.start()
    } catch (error) {
      this.logger.e("❌ Failed to start bot with allowed_updates:", error)
      throw error
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
   */
  async getMe() {
    return await this.bot.api.getMe()
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
   * Временный бан пользователя
   */
  async temporaryBanUser(chatId: number, userId: number, durationSec: number): Promise<void> {
    const untilDate = Math.floor(Date.now() / 1000) + durationSec
    await this.banUser(chatId, userId, untilDate)
  }

  /**
   * Отправка сообщения с автоудалением (упрощенный интерфейс)
   */
  async sendTempMessage(
    chatId: number,
    text: string,
    deleteAfterMs: number,
    parseMode?: "HTML" | "Markdown" | "MarkdownV2",
  ): Promise<MessageResult> {
    return await this.sendAutoDeleteMessage({
      chat_id: chatId,
      text,
      parse_mode: parseMode,
    }, deleteAfterMs)
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
