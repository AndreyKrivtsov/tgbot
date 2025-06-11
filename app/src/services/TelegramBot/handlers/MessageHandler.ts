import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { AIChatService } from "../../AIChatService/index.js"
import type { TelegramBot, TelegramBotSettings, TelegramMessageContext } from "../types/index.js"
import type { SpamDetector } from "../features/SpamDetector.js"
import type { UserManager } from "../features/UserManager.js"
import type { CommandHandler } from "./CommandHandler.js"
import type { ChatAiRepository } from "../../../repository/ChatAiRepository.js"
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
  private chatRepository: ChatAiRepository
  private isProcessing = false

  // AI Chat Service
  private chatService?: AIChatService

  constructor(
    logger: Logger,
    config: AppConfig,
    bot: TelegramBot,
    settings: TelegramBotSettings,
    userManager: UserManager,
    chatRepository: ChatAiRepository,
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

      // Обработка спама
      if (this.spamDetector) {
        const userCounter = await this.userManager.getUserOrCreate(from.id, from.username, from.firstName)
        const spamResult = await this.spamDetector.checkMessage(from.id, messageText, userCounter)
        if (spamResult.isSpam) {
          await this.spamDetector.handleSpamMessage(context, spamResult.reason, userCounter)
          return
        }
      }

      // Получаем информацию о боте для проверки упоминаний
      const botInfo = await this.bot.api.getMe()

      // Проверяем, является ли сообщение обращением к AI
      if (this.chatService) {
        // Проверяем упоминание бота
        const isMention = this.chatService.isBotMention(messageText, botInfo.username)

        // Если есть упоминание, обрабатываем через AI
        if (isMention) {
          return this.handleChat(context, messageText)
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
      await this.bot.api.sendMessage({
        chat_id: chatId,
        text: response,
        parse_mode: "Markdown",
      })

      this.logger.i(`✅ AI response sent to chat ${chatId}: ${response.substring(0, 100)}${response.length > 100 ? "..." : ""}`)
    } catch (error) {
      this.logger.e("Error handling AI response:", error)

      // Попробуем отправить сообщение об ошибке
      try {
        const chatId = Number.parseInt(contextId)
        await this.bot.api.sendMessage({
          chat_id: chatId,
          text: "❌ Произошла ошибка при отправке ответа AI",
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
      await this.bot.api.sendChatAction({
        chat_id: chatId,
        action: "typing",
      })

      this.logger.d(`🎭 Typing action sent for context ${contextId}`)
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

      this.logger.i(`🤖 Processing AI message from ${firstName} (${userId}) in chat ${chatId}: "${messageText.substring(0, 100)}${messageText.length > 100 ? "..." : ""}"`)

      // Обрабатываем сообщение через AI Chat Service
      const result = await this.chatService.processMessage(
        userId,
        chatId,
        messageText,
        username,
        firstName,
      )

      if (result.success) {
        this.logger.i(`✅ Message queued for AI processing (position: ${result.queuePosition})`)
      } else {
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

      const escapedReason = MessageFormatter.escapeMarkdownV2(restriction.reason || "Не указана")
      const escapedAdminUsername = this.config.ADMIN_USERNAME
        ? MessageFormatter.escapeMarkdownV2(this.config.ADMIN_USERNAME)
        : ""

      const restrictionText = `Вы заблокированы\\. \n\nПричина: ${escapedReason}\n\n${escapedAdminUsername}`

      await context.reply(restrictionText, { parse_mode: "MarkdownV2" })
    } catch (error) {
      this.logger.e("Error handling restricted user:", error)
    }
  }
}
