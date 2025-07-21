import type { EventBus } from "../../core/EventBus.js"
import type { BanUserEvent, DeleteMessageEvent, MuteUserEvent } from "../../types/events.js"
import type { Logger } from "../../helpers/Logger.js"

/**
 * Результат выполнения модерационного действия
 */
export interface ModerationResult {
  success: boolean
  message: string
  error?: string
}

/**
 * Инструменты модерации для Gemini API
 */
export class ModerationTools {
  constructor(
    private eventBus: EventBus,
    private logger: Logger,
  ) {}

  /**
   * Удаление сообщения
   */
  async deleteMessage(chatId: number, messageId: number, reason: string = "Нарушение правил"): Promise<ModerationResult> {
    try {
      const event: DeleteMessageEvent = {
        chatId,
        messageId,
        reason,
      }

      this.eventBus.emit("moderation.delete", event)

      this.logger.i(`🗑️ Message ${messageId} deletion requested in chat ${chatId}. Reason: ${reason}`)

      return {
        success: true,
        message: `Сообщение ${messageId} удалено. Причина: ${reason}`,
      }
    } catch (error) {
      this.logger.e("Error deleting message:", error)
      return {
        success: false,
        message: "Не удалось удалить сообщение",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Отключение пользователя (mute)
   */
  async muteUser(
    chatId: number,
    userId: number,
    duration: number = 3600,
    reason: string = "Нарушение правил чата",
  ): Promise<ModerationResult> {
    try {
      const event: MuteUserEvent = {
        chatId,
        userId,
        duration,
        reason,
      }

      this.eventBus.emit("moderation.mute", event)

      this.logger.i(`🔇 User ${userId} mute requested in chat ${chatId} for ${duration}s. Reason: ${reason}`)

      return {
        success: true,
        message: `Пользователь отключен на ${Math.floor(duration / 60)} минут. Причина: ${reason}`,
      }
    } catch (error) {
      this.logger.e("Error muting user:", error)
      return {
        success: false,
        message: "Не удалось отключить пользователя",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Включение пользователя (unmute)
   */
  async unmuteUser(chatId: number, userId: number, reason: string = "Снятие ограничений"): Promise<ModerationResult> {
    try {
      // Для размута используем событие mute с duration = 0
      const event: MuteUserEvent = {
        chatId,
        userId,
        duration: 0, // 0 означает снятие ограничений
        reason,
      }

      this.eventBus.emit("moderation.mute", event)

      this.logger.i(`🔊 User ${userId} unmute requested in chat ${chatId}. Reason: ${reason}`)

      return {
        success: true,
        message: `Ограничения с пользователя сняты. Причина: ${reason}`,
      }
    } catch (error) {
      this.logger.e("Error unmuting user:", error)
      return {
        success: false,
        message: "Не удалось снять ограничения с пользователя",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Блокировка пользователя (ban)
   */
  async banUser(
    chatId: number,
    userId: number,
    duration?: number,
    reason: string = "Серьезное нарушение правил",
  ): Promise<ModerationResult> {
    try {
      const event: BanUserEvent = {
        chatId,
        userId,
        duration,
        reason,
      }

      this.eventBus.emit("moderation.ban", event)

      const durationText = duration ? `на ${Math.floor(duration / 3600)} часов` : "навсегда"
      this.logger.i(`🚫 User ${userId} ban requested in chat ${chatId} ${durationText}. Reason: ${reason}`)

      return {
        success: true,
        message: `Пользователь заблокирован ${durationText}. Причина: ${reason}`,
      }
    } catch (error) {
      this.logger.e("Error banning user:", error)
      return {
        success: false,
        message: "Не удалось заблокировать пользователя",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Разблокировка пользователя (unban)
   */
  async unbanUser(chatId: number, userId: number, reason: string = "Снятие блокировки"): Promise<ModerationResult> {
    try {
      // Для разбана используем событие ban с duration = 0
      const event: BanUserEvent = {
        chatId,
        userId,
        duration: 0, // 0 означает снятие блокировки
        reason,
      }

      this.eventBus.emit("moderation.ban", event)

      this.logger.i(`🔓 User ${userId} unban requested in chat ${chatId}. Reason: ${reason}`)

      return {
        success: true,
        message: `Пользователь разблокирован. Причина: ${reason}`,
      }
    } catch (error) {
      this.logger.e("Error unbanning user:", error)
      return {
        success: false,
        message: "Не удалось разблокировать пользователя",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Получение объявлений функций для Gemini API
   */
  getFunctionDeclarations() {
    return [
      {
        name: "delete_message",
        description: "Удаляет сообщение в чате. Используется для удаления неподходящего контента, спама или нарушений правил.",
        parameters: {
          type: "object",
          properties: {
            chat_id: {
              type: "integer",
              description: "ID чата, где нужно удалить сообщение",
            },
            message_id: {
              type: "integer",
              description: "ID сообщения, которое нужно удалить",
            },
            reason: {
              type: "string",
              description: "Причина удаления сообщения (например: 'спам', 'оскорбления', 'реклама')",
            },
          },
          required: ["chat_id", "message_id"],
        },
      },
      {
        name: "mute_user",
        description: "Отключает возможность отправлять сообщения пользователю на определенное время. Используется при нарушениях правил чата.",
        parameters: {
          type: "object",
          properties: {
            chat_id: {
              type: "integer",
              description: "ID чата, где нужно отключить пользователя",
            },
            user_id: {
              type: "integer",
              description: "ID пользователя, которого нужно отключить",
            },
            duration: {
              type: "integer",
              description: "Длительность отключения в секундах (по умолчанию 3600 = 1 час)",
            },
            reason: {
              type: "string",
              description: "Причина отключения пользователя",
            },
          },
          required: ["chat_id", "user_id"],
        },
      },
      {
        name: "unmute_user",
        description: "Снимает ограничения с пользователя, возвращая возможность отправлять сообщения.",
        parameters: {
          type: "object",
          properties: {
            chat_id: {
              type: "integer",
              description: "ID чата, где нужно снять ограничения",
            },
            user_id: {
              type: "integer",
              description: "ID пользователя, с которого нужно снять ограничения",
            },
            reason: {
              type: "string",
              description: "Причина снятия ограничений",
            },
          },
          required: ["chat_id", "user_id"],
        },
      },
      {
        name: "ban_user",
        description: "Блокирует пользователя в чате. Используется при серьезных нарушениях правил. Может быть временным или постоянным.",
        parameters: {
          type: "object",
          properties: {
            chat_id: {
              type: "integer",
              description: "ID чата, где нужно заблокировать пользователя",
            },
            user_id: {
              type: "integer",
              description: "ID пользователя, которого нужно заблокировать",
            },
            duration: {
              type: "integer",
              description: "Длительность блокировки в секундах (если не указано - постоянная блокировка)",
            },
            reason: {
              type: "string",
              description: "Причина блокировки пользователя",
            },
          },
          required: ["chat_id", "user_id"],
        },
      },
      {
        name: "unban_user",
        description: "Разблокирует пользователя в чате, снимая блокировку.",
        parameters: {
          type: "object",
          properties: {
            chat_id: {
              type: "integer",
              description: "ID чата, где нужно разблокировать пользователя",
            },
            user_id: {
              type: "integer",
              description: "ID пользователя, которого нужно разблокировать",
            },
            reason: {
              type: "string",
              description: "Причина разблокировки пользователя",
            },
          },
          required: ["chat_id", "user_id"],
        },
      },
    ]
  }

  /**
   * Выполнение функции по имени
   */
  async executeFunction(functionName: string, args: any): Promise<ModerationResult> {
    switch (functionName) {
      case "delete_message":
        return this.deleteMessage(args.chat_id, args.message_id, args.reason)

      case "mute_user":
        return this.muteUser(args.chat_id, args.user_id, args.duration, args.reason)

      case "unmute_user":
        return this.unmuteUser(args.chat_id, args.user_id, args.reason)

      case "ban_user":
        return this.banUser(args.chat_id, args.user_id, args.duration, args.reason)

      case "unban_user":
        return this.unbanUser(args.chat_id, args.user_id, args.reason)

      default:
        return {
          success: false,
          message: `Неизвестная функция: ${functionName}`,
          error: "Unknown function",
        }
    }
  }
}
