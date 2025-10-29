import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { TelegramBot, TelegramBotSettings, TelegramMessageContext } from "../types/index.js"
import type { UserManager } from "../utils/UserManager.js"
import type { CommandHandler } from "./CommandHandler.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { AntiSpamService } from "../../AntiSpamService/index.js"
import type { AIChatService } from "../../AIChatService/AIChatService.js"
import type { TelegramBotService } from "../index.js"
import type { EventBus } from "../../../core/EventBus.js"
import { EVENTS } from "../../../core/EventBus.js"

export class MessageHandlerNew {
  private logger: Logger
  private config: AppConfig
  private bot: TelegramBot
  private settings: TelegramBotSettings
  private userManager: UserManager
  private chatRepository: ChatRepository
  private botService: TelegramBotService
  private eventBus: EventBus
  private isProcessing = false

  // Опциональные сервисы
  private antiSpamService?: AntiSpamService
  private commandHandler?: CommandHandler
  private chatService?: AIChatService

  constructor(
    logger: Logger,
    config: AppConfig,
    bot: TelegramBot,
    settings: TelegramBotSettings,
    userManager: UserManager,
    chatRepository: ChatRepository,
    userRestrictions: any,
    botService: TelegramBotService,
    eventBus: EventBus,
    antiSpamService?: AntiSpamService,
    commandHandler?: CommandHandler,
    chatService?: AIChatService,
  ) {
    this.logger = logger
    this.config = config
    this.bot = bot
    this.settings = settings
    this.userManager = userManager
    this.chatRepository = chatRepository
    this.botService = botService
    this.eventBus = eventBus
    this.antiSpamService = antiSpamService
    this.commandHandler = commandHandler
    this.chatService = chatService

    this.setupEventHandlers()
  }

  private setupEventHandlers(): void {
    this.eventBus.on(EVENTS.MESSAGE_RECEIVED, this.handleMessageEvent.bind(this))
  }

  private async handleMessageEvent(context: TelegramMessageContext): Promise<void> {
    if (this.isProcessing) {
      this.logger.w("Message handler is already processing, skipping message")
      return
    }

    this.isProcessing = true

    try {
      const { from, chat, text: messageText } = context

      if (!from || !chat || !messageText) {
        this.logger.w("Incomplete message data, skipping")
        return
      }

      if (chat.id < 0) {
        const isActive = await this.chatRepository.isChatActive(chat.id)
        if (!isActive) {
          this.logger.w(`Chat ${chat.id} is not active or not found in database, skipping message processing`)
          return
        }
      }

      await this.userManager.updateMessageCounter(from.id, from.username, from.firstName)
      await this.userManager.saveUserMapping(chat.id, from.id, from.username)

      // Обработка команд (если есть командный хендлер)
      if (messageText.startsWith("/") && this.commandHandler) {
        await this.commandHandler.handleCommand(context)
      }

      // AntiSpamService и AIChatService слушают MESSAGE_RECEIVED через EventBus
    } catch (error) {
      this.logger.e("Error handling message event:", error)
    } finally {
      this.isProcessing = false
    }
  }

  async handleMessage(context: TelegramMessageContext): Promise<void> {
    this.eventBus.emit(EVENTS.MESSAGE_RECEIVED, context)
  }

  getMessageStats(): object {
    return {
      isProcessing: this.isProcessing,
      hasAntiSpam: !!this.antiSpamService,
      hasCommandHandler: !!this.commandHandler,
      hasChatService: !!this.chatService,
    }
  }

  hasAIService(): boolean {
    return !!this.chatService
  }

  setAIService(chatService: AIChatService): void {
    this.chatService = chatService
  }
}
