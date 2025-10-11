import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { TelegramBot, TelegramBotSettings, TelegramMessageContext } from "../types/index.js"
import type { UserManager } from "../features/UserManager.js"
import type { CommandHandler } from "./CommandHandler.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { AntiSpamService } from "../../AntiSpamService/index.js"
import { TelegramModerationAdapter } from "../adapters/ModerationAdapter.js"
import type { AIChatService } from "../../AIChatService/AIChatService.js"
import type { TelegramBotService } from "../index.js"
import type { EventBus } from "../../../core/EventBus.js"

import { MessagePluginManager } from "../plugins/MessagePluginManager.js"
import { CommandPlugin } from "../plugins/CommandPlugin.js"
import { SpamPlugin } from "../plugins/SpamPlugin.js"
// AIPlugin удален

export class MessageHandlerNew {
  private logger: Logger
  private config: AppConfig
  private bot: TelegramBot
  private settings: TelegramBotSettings
  private userManager: UserManager
  private chatRepository: ChatRepository
  private moderation: TelegramModerationAdapter
  private botService: TelegramBotService
  private eventBus: EventBus
  private pluginManager: MessagePluginManager
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
    this.moderation = new TelegramModerationAdapter(bot, logger)
    this.botService = botService
    this.eventBus = eventBus
    this.antiSpamService = antiSpamService
    this.commandHandler = commandHandler
    this.chatService = chatService

    this.pluginManager = new MessagePluginManager(logger, eventBus)
    this.setupPlugins()
    this.setupEventHandlers()
  }

  private setupPlugins(): void {
    if (this.commandHandler) {
      this.pluginManager.registerPlugin(new CommandPlugin(this.logger, this.commandHandler))
    }
    if (this.antiSpamService) {
      this.pluginManager.registerPlugin(new SpamPlugin(
        this.logger,
        this.antiSpamService,
        this.userManager,
        this.moderation,
        this.config,
      ))
    }
    // AIPlugin отключен: сервис подписывается через EventBus/прямую интеграцию
  }

  private setupEventHandlers(): void {
    this.eventBus.on("message.received", this.handleMessageEvent.bind(this))
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

      await this.pluginManager.processMessage(context)
    } catch (error) {
      this.logger.e("Error handling message event:", error)
    } finally {
      this.isProcessing = false
    }
  }

  async handleMessage(context: TelegramMessageContext): Promise<void> {
    this.eventBus.emit("message.received", context)
  }

  async handleAIResponse(contextId: string, response: string, _messageId: number, userMessageId?: number, isError?: boolean): Promise<void> {
    try {
      const chatId = Number.parseInt(contextId)
      const messageParams: any = { chat_id: chatId, text: response }

      if (userMessageId) {
        messageParams.reply_parameters = { message_id: userMessageId }
      }

      if (isError) {
        await this.bot.sendGroupMessage(messageParams, 20000)
      } else {
        await this.bot.sendMessage(messageParams)
      }

      this.logger.d(`✅ AI response sent to chatId=${chatId}`)
    } catch (error) {
      this.logger.e("Error handling AI response:", error)
    }
  }

  async handleRestrictedUser(context: any, restriction: any): Promise<void> {
    try {
      if (context.delete) {
        await context.delete()
      }

      const escapedReason = restriction.reason || "Причина не указана"
      const escapedAdminUsername = this.config.ADMIN_USERNAME || ""
      const restrictionText = `Пользователь ограничен\\nПричина: ${escapedReason}\\nАдминистратор: ${escapedAdminUsername}`

      await this.bot.sendGroupMessage({
        chat_id: context.chat.id,
        text: restrictionText,
        parse_mode: "MarkdownV2",
      })
    } catch (error) {
      this.logger.e("Error handling restricted user:", error)
    }
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
    this.setupPlugins()
  }
}
