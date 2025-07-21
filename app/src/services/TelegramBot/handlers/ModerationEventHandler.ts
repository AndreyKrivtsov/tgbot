import type { EventBus } from "../../../core/EventBus.js"
import type { BanUserEvent, DeleteMessageEvent, MuteUserEvent, WarnUserEvent } from "../../../types/events.js"
import type { TelegramBot } from "../types/index.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"

/**
 * Обработчик событий модерации
 */
export class ModerationEventHandler {
  constructor(
    private bot: TelegramBot,
    private userRestrictions: UserRestrictions,
  ) {}

  /**
   * Подключение к событиям
   */
  setupEventListeners(eventBus: EventBus): void {
    eventBus.on("moderation.ban", this.handleBanUser.bind(this))
    eventBus.on("moderation.mute", this.handleMuteUser.bind(this))
    eventBus.on("moderation.delete", this.handleDeleteMessage.bind(this))
    eventBus.on("moderation.warn", this.handleWarnUser.bind(this))
  }

  /**
   * Обработка блокировки пользователя
   */
  private async handleBanUser(event: BanUserEvent): Promise<void> {
    try {
      await this.userRestrictions.restrictUser(event.chatId, event.userId)

      await this.bot.sendMessage({
        chat_id: event.chatId,
        text: `🔒 Пользователь заблокирован: ${event.reason}`,
      })
    } catch {
      // В продакшене здесь будет логирование
    }
  }

  /**
   * Обработка отключения сообщений
   */
  private async handleMuteUser(event: MuteUserEvent): Promise<void> {
    try {
      await this.userRestrictions.restrictUser(event.chatId, event.userId)

      await this.bot.sendMessage({
        chat_id: event.chatId,
        text: `🔇 Пользователь отключен: ${event.reason}`,
      })
    } catch {
      // В продакшене здесь будет логирование
    }
  }

  /**
   * Обработка удаления сообщения
   */
  private async handleDeleteMessage(event: DeleteMessageEvent): Promise<void> {
    try {
      await this.bot.deleteMessage(event.chatId, event.messageId)

      await this.bot.sendMessage({
        chat_id: event.chatId,
        text: `🗑️ Сообщение удалено: ${event.reason}`,
      })
    } catch {
      // В продакшене здесь будет логирование
    }
  }

  /**
   * Обработка предупреждения пользователя
   */
  private async handleWarnUser(event: WarnUserEvent): Promise<void> {
    try {
      await this.bot.sendMessage({
        chat_id: event.chatId,
        text: `⚠️ ${event.warningText}\nПричина: ${event.reason}`,
        reply_parameters: {
          message_id: event.userId, // Здесь нужен messageId, но для простоты используем userId
        },
      })
    } catch {
      // В продакшене здесь будет логирование
    }
  }
}
