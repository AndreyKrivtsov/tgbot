import type { IService } from "../core/Container.js"
import type { Logger } from "../helpers/Logger.js"
import type { AppConfig } from "../config.js"
import type { CaptchaService } from "./CaptchaService.js"
import type { AntiSpamService } from "./AntiSpamService.js"
import type { AIChatService } from "./AIChatService.js"

interface TelegramBotDependencies {
  repository?: any
  captchaService?: CaptchaService
  antiSpamService?: AntiSpamService
  aiChatService?: AIChatService
}

/**
 * Сервис Telegram бота с интеграцией всех функций
 */
export class TelegramBotService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: TelegramBotDependencies
  private bot: any = null
  private isRunning = false
  private hasGramIO = false

  constructor(config: AppConfig, logger: Logger, dependencies: TelegramBotDependencies = {}) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
  }

  /**
   * Инициализация бота
   */
  async initialize(): Promise<void> {
    this.logger.i("🤖 Initializing Telegram bot service...")

    try {
      // Проверяем наличие GramIO
      try {
        const { Bot } = await import("gramio")
        this.hasGramIO = true
        
        // Создаем бота
        this.bot = new Bot(this.config.BOT_TOKEN)
        
        // Настраиваем обработчики событий
        this.setupEventHandlers()
        
        this.logger.i("✅ Telegram bot initialized")
      } catch (error) {
        this.logger.w("⚠️ GramIO not available. Bot service disabled.")
        this.logger.w("📋 To enable bot:")
        this.logger.w("   1. Run: npm install gramio")
        this.logger.w("   2. Set BOT_TOKEN in .env")
        this.logger.w("   3. Restart the application")
      }
    } catch (error) {
      this.logger.e("❌ Failed to initialize Telegram bot:", error)
      // Не прерываем выполнение приложения
    }
  }

  /**
   * Запуск бота
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting Telegram bot...")

    if (!this.hasGramIO || !this.bot) {
      this.logger.w("🚫 Telegram bot not available")
      return
    }

    try {
      // Настраиваем колбэки для сервисов
      this.setupServiceCallbacks()
      
      // Запускаем бота
      await this.bot.start()
      this.isRunning = true
      
      // Получаем информацию о боте
      const botInfo = await this.bot.api.getMe()
      this.logger.i(`✅ Telegram bot started: @${botInfo.username}`)
      
    } catch (error) {
      this.logger.e("❌ Failed to start Telegram bot:", error)
      // Не прерываем выполнение приложения
    }
  }

  /**
   * Остановка бота
   */
  async stop(): Promise<void> {
    if (this.isRunning && this.bot) {
      this.logger.i("🛑 Stopping Telegram bot...")
      
      try {
        await this.bot.stop()
        this.isRunning = false
        this.logger.i("✅ Telegram bot stopped")
      } catch (error) {
        this.logger.e("Error stopping bot:", error)
      }
    }
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing Telegram bot service...")
    await this.stop()
    this.bot = null
    this.logger.i("✅ Telegram bot service disposed")
  }

  /**
   * Проверка состояния бота
   */
  isHealthy(): boolean {
    return this.isRunning && this.bot !== null
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventHandlers(): void {
    if (!this.bot) return

    // Обработка новых участников
    this.bot.on("chat_member", (context: any) => {
      this.handleChatMember(context)
    })

    this.bot.on("new_chat_members", (context: any) => {
      this.handleNewChatMembers(context)
    })

    this.bot.on("left_chat_member", (context: any) => {
      this.handleLeftChatMember(context)
    })

    // Обработка сообщений
    this.bot.on("message", (context: any) => {
      this.handleMessage(context)
    })

    // Обработка колбэков (капча)
    this.bot.on("callback_query", (context: any) => {
      this.handleCallbackQuery(context)
    })

    this.logger.d("Event handlers configured")
  }

  /**
   * Настройка колбэков для сервисов
   */
  private setupServiceCallbacks(): void {
    // Колбэки для CaptchaService
    if (this.dependencies.captchaService) {
      this.dependencies.captchaService.onCaptchaTimeout = (user) => {
        this.handleCaptchaTimeout(user)
      }
      
      this.dependencies.captchaService.onCaptchaSuccess = (user) => {
        this.handleCaptchaSuccess(user)
      }
      
      this.dependencies.captchaService.onCaptchaFailed = (user) => {
        this.handleCaptchaFailed(user)
      }
    }

    // Колбэки для AIChatService
    if (this.dependencies.aiChatService) {
      this.dependencies.aiChatService.onMessageResponse = (contextId, response, messageId) => {
        this.handleAIResponse(contextId, response, messageId)
      }
      
      this.dependencies.aiChatService.onTypingStart = (contextId) => {
        this.sendTypingAction(contextId)
      }
      
      this.dependencies.aiChatService.onTypingStop = (contextId) => {
        // Можно реализовать остановку typing индикатора если нужно
      }
    }

    this.logger.d("Service callbacks configured")
  }

  /**
   * Обработка изменения статуса участника чата
   */
  private async handleChatMember(context: any): Promise<void> {
    try {
      const oldMember = context.oldChatMember
      const newMember = context.newChatMember
      const chatId = context.chat.id
      const user = newMember.user

      this.logger.d(`Chat member status change: ${oldMember.status} -> ${newMember.status}`)

      // Новый участник
      if (oldMember.status === "left" && newMember.status === "member") {
        await this.initiateUserCaptcha(chatId, user)
      }
    } catch (error) {
      this.logger.e("Error handling chat member:", error)
    }
  }

  /**
   * Обработка новых участников
   */
  private async handleNewChatMembers(context: any): Promise<void> {
    try {
      const chatId = context.chat.id
      const newMembers = context.newChatMembers

      // Детальное логирование для отладки
      this.logger.d("=== NEW CHAT MEMBERS EVENT ===")
      this.logger.d(`Chat ID: ${chatId}`)
      this.logger.d(`Context keys: ${Object.keys(context).join(', ')}`)
      this.logger.d(`Context.messageId: ${context.messageId}`)
      this.logger.d(`Context.message: ${JSON.stringify(context.message, null, 2)}`)
      this.logger.d(`Context.message?.messageId: ${context.message?.messageId}`)
      this.logger.d(`Context.message?.message_id: ${context.message?.message_id}`)
      this.logger.d(`New members count: ${newMembers?.length || 0}`)
      
      // Пробуем разные варианты получения message ID
      let messageIdToDelete: number | undefined = undefined
      if (context.messageId) {
        messageIdToDelete = context.messageId
        this.logger.d(`Using context.messageId: ${messageIdToDelete}`)
      } else if (context.message?.messageId) {
        messageIdToDelete = context.message.messageId
        this.logger.d(`Using context.message.messageId: ${messageIdToDelete}`)
      } else if (context.message?.message_id) {
        messageIdToDelete = context.message.message_id
        this.logger.d(`Using context.message.message_id: ${messageIdToDelete}`)
      } else if (context.update?.message?.message_id) {
        messageIdToDelete = context.update.message.message_id
        this.logger.d(`Using context.update.message.message_id: ${messageIdToDelete}`)
      } else {
        this.logger.w("No message ID found in context - skipping message deletion")
        this.logger.d(`Full context: ${JSON.stringify(context, null, 2)}`)
      }

      // Удаляем системное сообщение о присоединении (если ID найден)
      if (messageIdToDelete) {
        this.logger.d(`Attempting to delete message with ID: ${messageIdToDelete}`)
        await this.deleteMessage(chatId, messageIdToDelete)
      }

      for (const user of newMembers) {
        if (!user.isBot) {
          this.logger.d(`Processing new member: ${user.firstName} (ID: ${user.id})`)
          await this.initiateUserCaptcha(chatId, user)
        } else {
          this.logger.d(`Skipping bot: ${user.firstName} (ID: ${user.id})`)
        }
      }
    } catch (error) {
      this.logger.e("Error handling new chat members:", error)
    }
  }

  /**
   * Обработка ушедших участников
   */
  private async handleLeftChatMember(context: any): Promise<void> {
    try {
      const userId = context.leftChatMember.id

      // Удаляем пользователя из ограниченных если есть
      if (this.dependencies.captchaService?.isUserRestricted(userId)) {
        const user = this.dependencies.captchaService.getRestrictedUser(userId)
        if (user) {
          await this.deleteMessage(user.chatId, user.questionId)
          this.dependencies.captchaService.removeRestrictedUser(userId)
        }
      }

      // Очищаем данные пользователя из репозитория
      this.dependencies.repository?.deleteUser?.(userId)

      this.logger.d(`User ${userId} left the chat, cleaned up data`)
    } catch (error) {
      this.logger.e("Error handling left chat member:", error)
    }
  }

  /**
   * Инициация капчи для пользователя
   */
  private async initiateUserCaptcha(chatId: number, user: any): Promise<void> {
    if (!this.dependencies.captchaService) {
      this.logger.w("Captcha service not available")
      return
    }

    try {
      // Генерируем капчу
      const captcha = this.dependencies.captchaService.generateCaptcha()
      
      // Отправляем капчу
      const questionMessage = await this.sendCaptchaMessage(
        chatId,
        user,
        captcha.question,
        captcha.options
      )

      // Добавляем пользователя в ограниченные
      this.dependencies.captchaService.addRestrictedUser(
        user.id,
        chatId,
        questionMessage.messageId,
        captcha.answer,
        user.username,
        user.firstName || "Unknown"
      )

      // Ограничиваем права пользователя
      await this.restrictUser(chatId, user.id)

      this.logger.i(`Captcha initiated for user ${user.id} (${user.firstName})`)
    } catch (error) {
      this.logger.e("Error initiating captcha:", error)
    }
  }

  /**
   * Отправка сообщения с капчей
   */
  private async sendCaptchaMessage(
    chatId: number,
    user: any,
    question: number[],
    options: number[]
  ): Promise<any> {
    const { InlineKeyboard } = await import("gramio")
    
    const userMention = user.username ? `@${user.username}` : user.firstName
    const text = `${userMention}, добро пожаловать! 🎉\n\nДля получения доступа к чату решите простой пример:\n\n${question[0]} + ${question[1]} = ?`
    
    const keyboard = new InlineKeyboard()
    for (let i = 0; i < options.length; i++) {
      const option = options[i]
      if (option !== undefined) {
        if (i % 2 === 0) keyboard.row()
        keyboard.text(option.toString(), option.toString())
      }
    }

    return await this.bot.api.sendMessage({
      chat_id: chatId,
      text,
      reply_markup: keyboard
    })
  }

  /**
   * Обработка колбэков (ответы на капчу)
   */
  private async handleCallbackQuery(context: any): Promise<void> {
    if (!this.dependencies.captchaService) return

    try {
      const userId = context.from.id
      const messageId = context.message?.messageId
      const userAnswer = parseInt(context.data)

      const validation = this.dependencies.captchaService.validateAnswer(
        userId,
        messageId,
        userAnswer
      )

      if (validation.user) {
        if (validation.isValid) {
          await this.handleCaptchaSuccess(validation.user)
        } else {
          await this.handleCaptchaFailed(validation.user)
        }

        // Удаляем сообщение с капчей
        await this.deleteMessage(validation.user.chatId, validation.user.questionId)
        this.dependencies.captchaService.removeRestrictedUser(userId)
      }

      // Отвечаем на колбэк
      await context.answerCallbackQuery()
    } catch (error) {
      this.logger.e("Error handling callback query:", error)
    }
  }

  /**
   * Обработка сообщений
   */
  private async handleMessage(context: any): Promise<void> {
    try {
      const userId = context.from?.id
      const chatId = context.chat?.id
      const messageText = context.text

      if (!userId || !chatId || !messageText) return

      // Получаем или создаем пользователя
      const user = this.getUserOrCreate(context.from)
      if (!user) return

      // Проверяем, не ограничен ли пользователь
      const restrictedCheck = this.dependencies.repository?.isRestricted?.(userId)
      if (restrictedCheck) {
        await this.handleRestrictedUser(context, restrictedCheck)
        return
      }

      // Проверка на спам для новых пользователей
      if (this.dependencies.antiSpamService) {
        const spamCheck = await this.dependencies.antiSpamService.checkMessage(userId, messageText)
        
        if (spamCheck.isSpam) {
          await this.handleSpamMessage(context, spamCheck.reason)
          return
        }
      }

      // Проверка на обращение к AI боту
      if (this.dependencies.aiChatService) {
        const botInfo = await this.bot.api.getMe()
        const isMention = this.dependencies.aiChatService.isBotMention(messageText, botInfo.username)
        
        if (isMention || context.replyToMessage?.from?.id === botInfo.id) {
          await this.handleAIChat(context)
          return
        }
      }

      // Увеличиваем счетчик сообщений пользователя
      this.dependencies.repository?.increaseMessages?.(userId)

    } catch (error) {
      this.logger.e("Error handling message:", error)
    }
  }

  /**
   * Обработка AI чата
   */
  private async handleAIChat(context: any): Promise<void> {
    if (!this.dependencies.aiChatService) return

    try {
      const result = await this.dependencies.aiChatService.processMessage(
        context.from.id,
        context.chat.id,
        context.text,
        context.from.username,
        context.from.firstName,
        !!context.replyToMessage
      )

      if (!result.success) {
        if (result.reason) {
          await context.reply(result.reason)
        }
      }
      // Если успешно добавлено в очередь, ничего не отправляем - ответ придет асинхронно
    } catch (error) {
      this.logger.e("Error handling AI chat:", error)
    }
  }

  /**
   * Обработка спам сообщения
   */
  private async handleSpamMessage(context: any, reason?: string): Promise<void> {
    try {
      const username = context.from?.username || ""
      const fullName = `${context.from?.firstName || ""} ${context.from?.lastName || ""}`.trim()
      
      const warningText = `Хмм... 🧐\nСообщение от [${fullName}${username ? `, @${username}` : ""}] похоже на спам.\n\nСообщение удалено. ${reason ? `\nПричина: ${reason}` : ""}\n\n${this.config.ADMIN_USERNAME || ""}`
      
      await context.reply(warningText)
      await context.delete()
      
      this.logger.w(`Spam message deleted from user ${context.from.id}: ${reason}`)
    } catch (error) {
      this.logger.e("Error handling spam message:", error)
    }
  }

  /**
   * Обработка ограниченного пользователя
   */
  private async handleRestrictedUser(context: any, restriction: any): Promise<void> {
    try {
      await context.delete()
      await context.reply(
        `Вы заблокированы. \n\nПричина: ${restriction.reason}\n\n${this.config.ADMIN_USERNAME || ""}`
      )
    } catch (error) {
      this.logger.e("Error handling restricted user:", error)
    }
  }

  /**
   * Получение или создание пользователя
   */
  private getUserOrCreate(fromUser: any): any {
    if (!fromUser?.id) return null

    if (!this.dependencies.repository?.exist?.(fromUser.id)) {
      return this.dependencies.repository?.newUser?.({
        id: fromUser.id,
        username: fromUser.username,
        firstname: fromUser.firstName
      })
    }

    return this.dependencies.repository?.getUser?.(fromUser.id)
  }

  /**
   * Успешная капча
   */
  private async handleCaptchaSuccess(user: any): Promise<void> {
    try {
      await this.unrestrictUser(user.chatId, user.userId)
      
      const successText = `✅ ${user.firstname}, добро пожаловать в чат! Капча решена правильно.`
      await this.sendMessage(user.chatId, successText)
      
      this.logger.i(`User ${user.userId} (${user.firstname}) passed captcha`)
    } catch (error) {
      this.logger.e("Error handling captcha success:", error)
    }
  }

  /**
   * Неправильная капча
   */
  private async handleCaptchaFailed(user: any): Promise<void> {
    try {
      await this.banUser(user.chatId, user.userId)
      
      const failText = `❌ ${user.firstname}, неправильный ответ. Вы временно заблокированы.`
      await this.sendMessage(user.chatId, failText)
      
      this.logger.w(`User ${user.userId} (${user.firstname}) failed captcha`)
    } catch (error) {
      this.logger.e("Error handling captcha failure:", error)
    }
  }

  /**
   * Таймаут капчи
   */
  private async handleCaptchaTimeout(user: any): Promise<void> {
    try {
      await this.banUser(user.chatId, user.userId)
      
      const timeoutText = `⏰ ${user.firstname}, время на решение капчи истекло. Вы временно заблокированы.`
      await this.sendMessage(user.chatId, timeoutText)
      
      this.logger.w(`User ${user.userId} (${user.firstname}) captcha timeout`)
    } catch (error) {
      this.logger.e("Error handling captcha timeout:", error)
    }
  }

  /**
   * Обработка ответа от AI
   */
  private async handleAIResponse(contextId: string, response: string, messageId: number): Promise<void> {
    try {
      await this.bot.api.sendMessage({
        chat_id: parseInt(contextId),
        text: response,
        reply_parameters: { message_id: messageId }
      })
    } catch (error) {
      this.logger.e("Error sending AI response:", error)
    }
  }

  /**
   * Отправка typing индикатора
   */
  private async sendTypingAction(contextId: string): Promise<void> {
    try {
      await this.bot.api.sendChatAction({
        chat_id: parseInt(contextId),
        action: "typing"
      })
    } catch (error) {
      this.logger.e("Error sending typing action:", error)
    }
  }

  /**
   * Ограничение прав пользователя
   */
  private async restrictUser(chatId: number, userId: number): Promise<void> {
    try {
      await this.bot.api.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
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
          can_pin_messages: false
        }
      })
    } catch (error) {
      this.logger.e("Error restricting user:", error)
    }
  }

  /**
   * Снятие ограничений с пользователя
   */
  private async unrestrictUser(chatId: number, userId: number): Promise<void> {
    try {
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
          can_invite_users: true,
          can_pin_messages: false
        }
      })
    } catch (error) {
      this.logger.e("Error unrestricting user:", error)
    }
  }

  /**
   * Бан пользователя
   */
  private async banUser(chatId: number, userId: number): Promise<void> {
    try {
      const unbanDate = Math.floor(Date.now() / 1000) + (60 * 60) // 1 час
      
      await this.bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
        until_date: unbanDate
      })
    } catch (error) {
      this.logger.e("Error banning user:", error)
    }
  }

  /**
   * Отправка сообщения
   */
  private async sendMessage(chatId: number, text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage({
        chat_id: chatId,
        text
      })
    } catch (error) {
      this.logger.e("Error sending message:", error)
    }
  }

  /**
   * Удаление сообщения
   */
  private async deleteMessage(chatId: number, messageId: number): Promise<void> {
    try {
      this.logger.d(`Deleting message: chatId=${chatId}, messageId=${messageId}`)
      
      if (!messageId || messageId === undefined) {
        this.logger.w(`Cannot delete message: messageId is ${messageId}`)
        return
      }

      await this.bot.api.deleteMessage({
        chat_id: chatId,
        message_id: messageId
      })
      
      this.logger.d(`Successfully deleted message ${messageId} in chat ${chatId}`)
    } catch (error: any) {
      this.logger.e(`Error deleting message ${messageId} in chat ${chatId}:`, error)
      
      // Дополнительная информация об ошибке
      if (error.code === 400) {
        this.logger.w("Bad Request - possible reasons:")
        this.logger.w("- Message was already deleted")
        this.logger.w("- Message is too old (>48 hours)")
        this.logger.w("- Bot doesn't have permission to delete messages")
        this.logger.w("- Invalid message_id format")
      }
    }
  }

  /**
   * Получение информации о сервисе
   */
  getServiceInfo(): object {
    return {
      isRunning: this.isRunning,
      hasGramIO: this.hasGramIO,
      hasRepository: !!this.dependencies.repository,
      hasCaptchaService: !!this.dependencies.captchaService,
      hasAntiSpamService: !!this.dependencies.antiSpamService,
      hasAIChatService: !!this.dependencies.aiChatService,
      status: this.isRunning ? "active" : "inactive"
    }
  }
} 