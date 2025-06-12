import { Bot } from "gramio"
import type { MessageContext, NewChatMembersContext } from "gramio"
import type { Logger } from "../../../helpers/Logger.js"

/**
 * Обертка для библиотеки GramIO с минималистичным API
 * Предоставляет только методы, используемые в приложении
 */
export class GramioBot {
  private bot: Bot
  private logger: Logger
  private autoDeleteTimers = new Map<number, NodeJS.Timeout>()

  constructor(token: string, logger: Logger) {
    this.bot = new Bot(token)
    this.logger = logger
  }

  /**
   * Регистрация обработчика событий
   */
  on<T extends keyof Events>(event: T, handler: (context: Events[T]) => void | Promise<void>): void {
    this.bot.on(event, handler)
  }

  /**
   * Запуск бота
   */
  async start(): Promise<void> {
    await this.bot.start()
  }

  /**
   * Остановка бота
   */
  async stop(): Promise<void> {
    // Очищаем все активные таймеры
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
    return await this.bot.api.sendMessage(params)
  }

  /**
   * Отправка сообщения с автоудалением через заданное время
   */
  async sendAutoDeleteMessage(
    params: SendMessageParams,
    deleteAfterMs: number,
  ): Promise<MessageResult> {
    const result = await this.bot.api.sendMessage(params)

    // Устанавливаем таймер автоудаления
    const timer = setTimeout(() => {
      this.deleteMessage(params.chat_id, result.message_id)
        .catch((error) => {
          this.logger.w(`Failed to auto-delete message ${result.message_id}:`, error)
        })
        .finally(() => {
          this.autoDeleteTimers.delete(result.message_id)
        })
    }, deleteAfterMs)

    this.autoDeleteTimers.set(result.message_id, timer)

    return result
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
   * Ограничение пользователя (мьют)
   */
  async restrictUser(chatId: number, userId: number, permissions: ChatPermissions): Promise<void> {
    await this.bot.api.restrictChatMember({
      chat_id: chatId,
      user_id: userId,
      permissions,
    })
  }

  /**
   * Снятие ограничений с пользователя
   */
  async unrestrictUser(chatId: number, userId: number): Promise<void> {
    await this.bot.api.restrictChatMember({
      chat_id: chatId,
      user_id: userId,
      permissions: {
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
        can_invite_users: false,
        can_pin_messages: false,
        can_manage_topics: false,
      },
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
    // Баним пользователя
    await this.banUser(chatId, userId)

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
    deleteAfterMs: number = 60_000, // 60 секунд по умолчанию
  ): Promise<MessageResult> {
    // Если это приватный чат (положительный ID), отправляем обычное сообщение
    if (params.chat_id > 0) {
      return await this.sendMessage(params)
    }
    
    // Если это групповой чат (отрицательный ID), отправляем с автоудалением
    return await this.sendAutoDeleteMessage(params, deleteAfterMs)
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