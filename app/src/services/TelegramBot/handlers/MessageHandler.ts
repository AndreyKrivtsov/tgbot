import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { TelegramBot, TelegramBotSettings, TelegramMessageContext } from "../types/index.js"
import type { CommandHandler } from "./CommandHandler.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { AntiSpamService } from "../../AntiSpamService/index.js"
import type { TelegramBotService } from "../index.js"
import type { EventBus } from "../../../core/EventBus.js"
// no EVENTS import needed here; we use typed emitters

export class MessageHandler {
  private logger: Logger
  private config: AppConfig
  private bot: TelegramBot
  private settings: TelegramBotSettings
  private chatRepository: ChatRepository
  private botService: TelegramBotService
  private eventBus: EventBus
  private isProcessing = false

  // Опциональные сервисы
  private antiSpamService?: AntiSpamService
  private commandHandler?: CommandHandler

  constructor(
    logger: Logger,
    config: AppConfig,
    bot: TelegramBot,
    settings: TelegramBotSettings,
    chatRepository: ChatRepository,
    userRestrictions: any,
    botService: TelegramBotService,
    eventBus: EventBus,
    antiSpamService?: AntiSpamService,
    commandHandler?: CommandHandler,
  ) {
    this.logger = logger
    this.config = config
    this.bot = bot
    this.settings = settings
    this.chatRepository = chatRepository
    this.botService = botService
    this.eventBus = eventBus
    this.antiSpamService = antiSpamService
    this.commandHandler = commandHandler
  }

  private async handleMessageEvent(context: TelegramMessageContext): Promise<void> {
    if (this.isProcessing) {
      this.logger.w("Message handler is already processing, skipping message")
      return
    }

    this.isProcessing = true

    try {
      const { from, chat, text: messageText } = context

      // Общая валидация
      if (!from || !chat || !messageText) {
        this.logger.d("Empty message text, skipping")
        return
      }

      // Игнорируем сообщения от ботов
      if ((from as any).is_bot) {
        return
      }

      const chatType = (chat as any).type
      const isGroup = chatType === "group" || chatType === "supergroup" || chat.id < 0
      const isPrivate = chatType === "private" || chat.id > 0

      // Сначала проверяем команды (и в группах, и в приватах)
      const isCommand = messageText.startsWith("/")
      if (isCommand && this.commandHandler) {
        await this.commandHandler.handleCommand(context)
        return
      }

      if (isGroup) {
        // Проверка активности группы
        const isActive = await this.chatRepository.isChatActive(chat.id)
        if (!isActive) {
          this.logger.w(`Chat ${chat.id} is not active or not found in database, skipping message processing`)
          return
        }

        // Эмитим валидное групповое сообщение (ordered)
        // Счетчики сообщений обрабатываются в AntiSpamService
        await this.eventBus.emitMessageGroupOrdered({
          from: { id: from.id, username: from.username, firstName: from.firstName },
          chat: { id: chat.id, type: chatType || (chat.id < 0 ? "supergroup" : "group") },
          text: messageText,
          id: (context as any).id || (context as any).messageId || Date.now(),
          replyMessage: (context as any).replyMessage,
        })
        return
      }

      if (isPrivate) {
        // Приватные НЕ-командные сообщения не эмитим
        // Просто выходим из обработчика без дополнительной логики
      }

      // Обработка команд больше не требуется здесь
    } catch (error) {
      this.logger.e("Error handling message event:", error)
    } finally {
      this.isProcessing = false
    }
  }

  async handleMessage(context: TelegramMessageContext): Promise<void> {
    // Сразу валидируем и маршрутизируем
    await this.handleMessageEvent(context)
  }
}
