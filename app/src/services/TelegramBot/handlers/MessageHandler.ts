import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { AIChatService } from "../../AIChatService/index.js"
import type { TelegramBot, TelegramBotSettings, TelegramMessageContext } from "../types/index.js"
import type { SpamDetector } from "../features/SpamDetector.js"
import type { UserManager } from "../features/UserManager.js"
import type { CommandHandler } from "./CommandHandler.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import { getMessage } from "../utils/Messages.js"
import { MessageFormatter } from "../utils/MessageFormatter.js"

/**
 * Обработчик сообщений для Telegram бота
 */
export class MessageHandler {
  private logger: Logger
  private config: AppConfig
  private bot: TelegramBot
  private settings: TelegramBotSettings
  private spamDetector?: SpamDetector
  private userManager: UserManager
  private commandHandler?: CommandHandler
  private chatRepository: ChatRepository
  private isProcessing = false

  // AI Chat Service
  private chatService?: AIChatService

  constructor(
    logger: Logger,
    config: AppConfig,
    bot: TelegramBot,
    settings: TelegramBotSettings,
    userManager: UserManager,
    chatRepository: ChatRepository,
    spamDetector?: SpamDetector,
    commandHandler?: CommandHandler,
    chatService?: AIChatService,
  ) {
    this.logger = logger
    this.config = config
    this.bot = bot
    this.settings = settings
    this.userManager = userManager
    this.chatRepository = chatRepository
    this.spamDetector = spamDetector
    this.commandHandler = commandHandler
    this.chatService = chatService
  }

  /**
   * Основной обработчик сообщений
   */
  async handleMessage(context: TelegramMessageContext): Promise<void> {
    if (this.isProcessing) {
      this.logger.w("Message handler is already processing, skipping message")
      return
    }

    this.isProcessing = true

    try {
      const { from, chat, text: messageText } = context

      // Проверяем наличие обязательных данных
      if (!from || !chat || !messageText) {
        this.logger.w("Incomplete message data, skipping")
        return
      }

      // Обработка команд
      if (this.commandHandler && messageText.startsWith("/")) {
        await this.commandHandler.handleCommand(context)
        return
      }

      // Проверяем, есть ли чат в базе данных (только для групп)
      if (chat.id < 0) {
        const isActive = await this.chatRepository.isChatActive(chat.id)
        if (!isActive) {
          this.logger.w(`Chat ${chat.id} is not active or not found in database, skipping message processing`)
          return
        }
      }

      // Обновляем счетчик пользователя
      await this.userManager.updateMessageCounter(from.id, from.username, from.firstName)

      // Получаем информацию о боте для проверки упоминаний
      const botInfo = await this.bot.getMe()

      // Проверяем, является ли сообщение обращением к AI
      if (this.chatService) {
        // Проверяем упоминание бота
        const isMention = this.chatService.isBotMention(messageText, botInfo.username)

        // Если есть упоминание, обрабатываем через AI
        if (isMention) {
          return this.handleChat(context, messageText)
        }
      }

      // Обработка спама
      if (this.spamDetector) {
        const userCounter = await this.userManager.getUserOrCreate(from.id, from.username, from.firstName)
        const spamResult = await this.spamDetector.checkMessage(from.id, messageText, userCounter)
        if (spamResult.isSpam) {
          await this.spamDetector.handleSpamMessage(context, spamResult.reason, userCounter)
        }
      }
    } catch (error) {
      this.logger.e("Error handling message:", error)
    } finally {
      this.isProcessing = false
    }
  }

  /**
   * Обработка AI ответов
   */
  async handleAIResponse(contextId: string, response: string, _messageId: number): Promise<void> {
    try {
      const chatId = Number.parseInt(contextId)

      // Отправляем ответ AI в чат
      await this.bot.sendMessage({
        chat_id: chatId,
        text: response,
        parse_mode: "Markdown",
      })

      this.logger.d(`✅ AI response sent to chat ${chatId} (${response.length} chars)`)
    } catch (error) {
      this.logger.e("Error handling AI response:", error)

      // Попробуем отправить сообщение об ошибке
      try {
        const chatId = Number.parseInt(contextId)
        const errorMessage = getMessage("ai_response_error")
        await this.bot.sendGroupMessage({
          chat_id: chatId,
          text: errorMessage,
        })
      } catch (sendError) {
        this.logger.e("Failed to send error message:", sendError)
      }
    }
  }

  /**
   * Отправка typing действия
   */
  async sendTypingAction(contextId: string): Promise<void> {
    try {
      const chatId = Number.parseInt(contextId)

      // Отправляем typing индикатор
      await this.bot.sendChatAction(chatId, "typing")
    } catch (error) {
      this.logger.e("Error sending typing action:", error)
    }
  }

  /**
   * Обработка AI чата
   */
  private async handleChat(context: TelegramMessageContext, messageText: string): Promise<void> {
    if (!this.chatService || !context.from) {
      this.logger.w("Cannot handle AI chat: missing chatService or user info")
      return
    }

    try {
      const userId = context.from.id
      const chatId = context.chat.id
      const username = context.from.username
      const firstName = context.from.firstName

      this.logger.d(`🤖 Processing AI message from ${firstName} (${userId}) in chat ${chatId}`)

      // Обрабатываем сообщение через AI Chat Service
      const result = await this.chatService.processMessage(
        userId,
        chatId,
        messageText,
        username,
        firstName,
      )

      if (!result.success) {
        this.logger.w(`❌ Failed to queue AI message: ${result.reason}`)
      }
    } catch (error) {
      this.logger.e("Error handling AI chat:", error)
    }
  }

  /**
   * Получение статистики обработки сообщений
   */
  getMessageStats(): object {
    return {
      isProcessing: this.isProcessing,
      hasSpamDetector: !!this.spamDetector,
      hasCommandHandler: !!this.commandHandler,
      hasChatService: !!this.chatService,
    }
  }

  /**
   * Проверка наличия AI сервиса
   */
  hasAIService(): boolean {
    return !!this.chatService
  }

  /**
   * Установка AI сервиса
   */
  setAIService(chatService: AIChatService): void {
    this.chatService = chatService
  }

  /**
   * Обработка ограниченного пользователя
   */
  async handleRestrictedUser(context: any, restriction: any): Promise<void> {
    try {
      if (context.delete) {
        await context.delete()
      }

      const escapedReason = MessageFormatter.escapeMarkdownV2(restriction.reason || getMessage("reason_not_specified"))
      const escapedAdminUsername = this.config.ADMIN_USERNAME
        ? MessageFormatter.escapeMarkdownV2(this.config.ADMIN_USERNAME)
        : ""

      const restrictionText = getMessage("user_restricted", {
        reason: escapedReason,
        admin: escapedAdminUsername,
      })

      await this.bot.sendGroupMessage({
        chat_id: context.chat.id,
        text: restrictionText,
        parse_mode: "MarkdownV2",
      })
    } catch (error) {
      this.logger.e("Error handling restricted user:", error)
    }
  }
}
