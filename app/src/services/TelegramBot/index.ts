import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { CaptchaService } from "../CaptchaService/index.js"
import type { AntiSpamService } from "../AntiSpamService/index.js"
import type { AIChatService } from "../AIChatService/index.js"
import type { Bot, MessageContext, NewChatMembersContext } from "gramio"

interface TelegramBotDependencies {
  repository?: any
  captchaService?: CaptchaService
  antiSpamService?: AntiSpamService
  aiChatService?: AIChatService
}

interface TelegramBotSettings {
  // Настройки капчи
  captchaTimeoutMs: number // Таймаут капчи (по умолчанию 60 сек)
  captchaCheckIntervalMs: number // Интервал проверки истекших капч (по умолчанию 5 сек)

  // Настройки сообщений
  errorMessageDeleteTimeoutMs: number // Таймаут удаления сообщений об ошибках (по умолчанию 60 сек)
  deleteSystemMessages: boolean // Удалять системные сообщения о входе/выходе (по умолчанию true)

  // Настройки банов
  temporaryBanDurationSec: number // Длительность временного бана в секундах (по умолчанию 40 сек)
  autoUnbanDelayMs: number // Задержка автоматического разбана (по умолчанию 5 сек)

  // Настройки антиспама
  maxMessagesForSpamCheck: number // Максимальное количество сообщений для проверки антиспамом (по умолчанию 5)
}

interface UserMessageCounter {
  userId: number
  messageCount: number
  spamCount: number // Счетчик спам сообщений
  username?: string
  firstName: string
  lastActivity: number
}

/**
 * Сервис Telegram бота с интеграцией всех функций
 */
export class TelegramBotService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: TelegramBotDependencies
  private settings: TelegramBotSettings
  private userMessageCounters: Map<number, UserMessageCounter> = new Map()
  private bot: Bot | null = null
  private isRunning = false
  private hasGramIO = false

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: TelegramBotDependencies = {},
    settings?: Partial<TelegramBotSettings>,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Настройки по умолчанию
    this.settings = {
      captchaTimeoutMs: 60000, // 60 секунд
      captchaCheckIntervalMs: 5000, // 5 секунд
      errorMessageDeleteTimeoutMs: 60000, // 60 секунд
      deleteSystemMessages: true, // Удалять системные сообщения
      temporaryBanDurationSec: 40, // 40 секунд
      autoUnbanDelayMs: 5000, // 5 секунд
      maxMessagesForSpamCheck: 5, // 5 сообщений для проверки антиспамом
      ...settings,
    }
  }

  /**
   * Экранирование символов для HTML
   */
  private escapeHTML(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  }

  /**
   * Экранирование символов для MarkdownV2
   */
  private escapeMarkdownV2(text: string): string {
    // Символы, которые нужно экранировать в MarkdownV2:
    // _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&")
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
      } catch (_error) {
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
   * Запуск сервиса
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting TelegramBot service...")

    // Проверяем зависимости
    this.logger.i("🔍 [ANTISPAM DEBUG] Checking dependencies:")
    this.logger.i(`  Repository: ${!!this.dependencies.repository}`)
    this.logger.i(`  CaptchaService: ${!!this.dependencies.captchaService}`)
    this.logger.i(`  AntiSpamService: ${!!this.dependencies.antiSpamService}`)
    this.logger.i(`  AIChatService: ${!!this.dependencies.aiChatService}`)

    // Дополнительная отладочная информация об AntiSpamService
    if (this.dependencies.antiSpamService) {
      this.logger.i("🛡️ [ANTISPAM DEBUG] AntiSpamService details:")
      this.logger.i(`   - Service type: ${this.dependencies.antiSpamService.constructor.name}`)
      this.logger.i(`   - Has checkMessage method: ${typeof this.dependencies.antiSpamService.checkMessage === "function"}`)
      this.logger.i(`   - Is healthy: ${typeof this.dependencies.antiSpamService.isHealthy === "function" ? this.dependencies.antiSpamService.isHealthy() : "unknown"}`)
    } else {
      this.logger.w("⚠️ [ANTISPAM DEBUG] AntiSpamService is NOT available")
    }

    // Отладочная информация о настройках
    this.logger.i("🔧 [ANTISPAM DEBUG] Bot settings:")
    this.logger.i(`   - maxMessagesForSpamCheck: ${this.settings.maxMessagesForSpamCheck}`)
    this.logger.i(`   - Other settings:`, JSON.stringify(this.settings, null, 2))

    if (!this.dependencies.captchaService) {
      this.logger.w("⚠️ CaptchaService is not available - captcha functionality will be disabled")
    }

    if (!this.hasGramIO || !this.bot) {
      this.logger.w("🚫 Telegram bot not available (GramIO not installed or BOT_TOKEN not set)")
      return
    }

    this.setupServiceCallbacks()

    if (this.isRunning) {
      this.logger.w("TelegramBot service is already running")
      return
    }

    try {
      await this.bot.start()
      this.isRunning = true

      // Получаем информацию о боте
      const botInfo = await this.bot.api.getMe()

      // Запускаем периодическую очистку старых записей о спам-нарушениях
      this.startSpamCleanupTimer()

      // Тестируем AntiSpamService при запуске
      if (this.dependencies.antiSpamService && typeof (this.dependencies.antiSpamService as any).testAntiSpam === "function") {
        this.logger.i("🧪 [ANTISPAM DEBUG] Running AntiSpam test...")
        try {
          await (this.dependencies.antiSpamService as any).testAntiSpam()
        } catch (error) {
          this.logger.e("🧪 [ANTISPAM DEBUG] AntiSpam test failed:", error)
        }
      }

      this.logger.i(`✅ TelegramBot service started: @${botInfo.username}`)
    } catch (error) {
      this.logger.e("❌ Failed to start TelegramBot service:", error)
      throw error
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
    if (!this.bot)
      return

    // Обработка команд
    this.bot.command("start", (context: any) => {
      this.handleStartCommand(context)
    })

    this.bot.command("help", (context: any) => {
      this.handleHelpCommand(context)
    })

    this.bot.command("stats", (context: any) => {
      this.handleStatsCommand(context)
    })

    // Административные команды
    this.bot.command("ban", (context: any) => {
      this.handleBanCommand(context)
    })

    this.bot.command("unban", (context: any) => {
      this.handleUnbanCommand(context)
    })

    this.bot.command("mute", (context: any) => {
      this.handleMuteCommand(context)
    })

    this.bot.command("unmute", (context: any) => {
      this.handleUnmuteCommand(context)
    })

    // Обработка новых участников
    this.bot.on("chat_member", (context: any) => {
      this.logger.i("🔥 CHAT_MEMBER event triggered!")
      this.handleChatMember(context)
    })

    this.bot.on("new_chat_members", (context: any) => {
      this.logger.i("🔥 NEW_CHAT_MEMBERS event triggered!")
      this.handleNewChatMembers(context)
    })

    this.bot.on("left_chat_member", (context: any) => {
      this.logger.i("🔥 LEFT_CHAT_MEMBER event triggered!")
      this.handleLeftChatMember(context)
    })

    // Обработка сообщений
    this.bot.on("message", (context: MessageContext<Bot>) => {
      this.handleMessage(context)
    })

    // Обработка колбэков (капча)
    this.bot.on("callback_query", (context: any) => {
      this.handleCallbackQuery(context)
    })
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
  }

  /**
   * Обработка изменения статуса участника чата
   */
  private async handleChatMember(context: any): Promise<void> {
    const _oldMember = context.oldChatMember
    const newMember = context.newChatMember
    const _chatId = context.chat.id
    const _user = newMember.user

    if (newMember.status === "member" && context.oldChatMember.status === "left") {
      // Пользователь присоединился к группе
      await this.handleNewChatMembers({
        ...context,
        newChatMembers: [newMember.user],
      } as NewChatMembersContext<Bot>)
    }
  }

  /**
   * Обработка новых участников
   */
  private async handleNewChatMembers(context: NewChatMembersContext<Bot>): Promise<void> {
    try {
      this.logger.i("🎯 Processing new chat members...")

      const chatId = context.chat.id
      const newMembers = context.newChatMembers
      const messageId = (context as any).messageId || (context as any).message_id || context.id

      // Удаляем системное сообщение о присоединении
      if (this.settings.deleteSystemMessages && messageId) {
        await this.deleteMessage(chatId, messageId)
      }

      // Детальное логирование для отладки
      this.logger.i("=== NEW CHAT MEMBERS EVENT ===")
      this.logger.i(`Chat ID: ${chatId}`)
      this.logger.i(`Message ID: ${messageId}`)
      this.logger.i(`New members count: ${newMembers?.length || 0}`)
      this.logger.i(`CaptchaService available: ${!!this.dependencies.captchaService}`)

      if (newMembers?.length) {
        newMembers.forEach((user: any, index: number) => {
          this.logger.i(`Member ${index + 1}: ${user.firstName} (ID: ${user.id}, isBot: ${user.isBot()})`)
        })

        for (const user of newMembers) {
          if (!user.isBot()) {
            this.logger.i(`🔐 Processing captcha for new member: ${user.firstName} (ID: ${user.id})`)
            await this.initiateUserCaptcha(chatId, user)
          } else {

          }
        }
      }

      this.logger.i("✅ New chat members processing completed")
    } catch (error) {
      this.logger.e("❌ Error handling new chat members:", error)
    }
  }

  /**
   * Обработка ушедших участников
   */
  private async handleLeftChatMember(context: any): Promise<void> {
    // Обработка покидания участника
    // Пока не реализовано
  }

  /**
   * Инициация капчи для пользователя
   */
  private async initiateUserCaptcha(chatId: number, user: any): Promise<void> {
    this.logger.i(`🔐 Starting captcha initiation for user ${user.id} (${user.firstName})`)

    if (!this.dependencies.captchaService) {
      this.logger.w("❌ Captcha service not available")
      return
    }

    // Проверяем, не создана ли уже капча для этого пользователя
    if (this.dependencies.captchaService.isUserRestricted(user.id)) {
      this.logger.i(`⚠️ User ${user.id} already has active captcha, skipping duplicate`)
      return
    }

    try {
      this.logger.i("🎲 Generating captcha challenge...")

      // Генерируем капчу
      const captcha = this.dependencies.captchaService.generateCaptcha()

      // Проверяем валидность капчи
      if (!captcha.question || captcha.question.length < 2
        || typeof captcha.question[0] !== "number" || typeof captcha.question[1] !== "number") {
        this.logger.e("❌ Invalid captcha question generated")
        return
      }

      this.logger.i(`🧮 Captcha generated: ${captcha.question[0]} + ${captcha.question[1]} = ${captcha.answer}`)
      this.logger.i(`🔢 Options: [${captcha.options.join(", ")}]`)

      this.logger.i("📤 Sending captcha message...")

      // Отправляем капчу
      const correctAnswer = captcha.question[0] + captcha.question[1]
      const sentMessage = await this.sendCaptchaMessage(
        chatId,
        user,
        captcha.question,
        captcha.options,
      )

      this.logger.i(`✅ Captcha message sent with ID: ${sentMessage?.messageId || sentMessage?.message_id || "unknown"}`)

      // Добавляем пользователя в ограниченные
      if (this.dependencies.captchaService && sentMessage) {
        this.dependencies.captchaService.addRestrictedUser(
          user.id,
          chatId,
          sentMessage?.messageId || sentMessage?.message_id || 0,
          captcha.answer,
          user.username,
        )
      }

      // Ограничиваем права пользователя
      this.logger.i("🚫 Restricting user permissions...")
      await this.restrictUser(chatId, user.id)

      this.logger.i(`🎉 Captcha initiated successfully for user ${user.id} (${user.firstName})`)
    } catch (error) {
      this.logger.e(`❌ Error initiating captcha for user ${user.id}:`, error)
    }
  }

  /**
   * Отправка сообщения с капчей
   */
  private async sendCaptchaMessage(
    chatId: number,
    user: any,
    question: number[],
    options: number[],
  ): Promise<any> {
    if (!this.bot)
      return null

    // Проверяем валидность входных данных
    if (!question || question.length < 2
      || typeof question[0] !== "number" || typeof question[1] !== "number") {
      this.logger.e("❌ Invalid question data provided to sendCaptchaMessage")
      return null
    }

    // Выбираем правильный ответ
    const correctAnswer = question[0] + question[1]

    try {
      const sentMessage = await this.bot.api.sendMessage({
        chat_id: chatId,
        text: `🔐 Для подтверждения, что вы не робот, решите пример:

${question[0]} + ${question[1]} = ?

Выберите правильный ответ:`,
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            options.map((option, index) => ({
              text: option.toString(),
              callback_data: `captcha_${user.id}_${index}_${option === correctAnswer ? "correct" : "wrong"}`,
            })),
          ],
        },
      })

      return sentMessage
    } catch (error) {
      this.logger.e("Error sending captcha message:", error)
      return null
    }
  }

  /**
   * Обработка колбэков (ответы на капчу)
   */
  private async handleCallbackQuery(context: any): Promise<void> {
    this.logger.i("🔘 Processing callback query...")

    if (!this.dependencies.captchaService) {
      this.logger.w("❌ CaptchaService not available for callback")
      return
    }

    try {
      const userId = context.from.id
      const userAnswer = Number.parseInt(context.data)

      // Получаем messageId из callback query
      let messageId: number | undefined
      if (context.message?.messageId) {
        messageId = context.message.messageId
      } else if (context.message?.message_id) {
        messageId = context.message.message_id
      } else if (context.message?.id) {
        messageId = context.message.id
      } else if (context.messageId) {
        messageId = context.messageId
      } else if (context.message_id) {
        messageId = context.message_id
      } else if (context.id) {
        messageId = context.id
      }

      this.logger.i(`📝 Callback details: userId=${userId}, messageId=${messageId}, answer=${userAnswer}`)

      if (messageId === undefined) {
        this.logger.e("❌ Could not determine messageId from callback context")
        await context.answerCallbackQuery()
        return
      }

      const validation = this.dependencies.captchaService.validateAnswer(
        userId,
        messageId,
        userAnswer,
      )

      this.logger.i(`🔍 Validation result: isValid=${validation.isValid}, user found=${!!validation.user}`)

      if (validation.user) {
        if (validation.isValid) {
          this.logger.i("✅ Captcha answer is CORRECT!")
          await this.handleCaptchaSuccess(validation.user)
        } else {
          this.logger.i("❌ Captcha answer is WRONG!")
          await this.handleCaptchaFailed(validation.user)
        }

        // Удаляем сообщение с капчей
        await this.deleteMessage(validation.user.chatId, validation.user.questionId)
        this.dependencies.captchaService.removeRestrictedUser(userId)
        this.logger.i("🧹 User removed from restricted list")
      } else {
        this.logger.w("⚠️ No restricted user found for this callback")
      }

      // Отвечаем на колбэк
      await context.answerCallbackQuery()
    } catch (error) {
      this.logger.e("❌ Error handling callback query:", error)
    }
  }

  /**
   * Обработка сообщений
   */
  private async handleMessage(context: MessageContext<Bot>): Promise<void> {
    const fromUser = context.from
    const messageText = context.text
    const _chatType = context.chat?.type

    if (!fromUser || !messageText)
      return

    const userId = fromUser.id
    const chatId = context.chat?.id

    if (!chatId)
      return

    // Получаем или создаем счетчик сообщений пользователя (ХРАНИТСЯ В КЕШЕ)
    let userCounter = this.userMessageCounters.get(userId)
    if (!userCounter) {
      userCounter = {
        userId,
        messageCount: 0,
        spamCount: 0,
        username: fromUser.username,
        firstName: fromUser.firstName || "Unknown",
        lastActivity: Date.now(),
      }
      this.userMessageCounters.set(userId, userCounter)
    }

    // Увеличиваем счетчик сообщений
    userCounter.messageCount++

    // Обновляем информацию о пользователе
    userCounter.username = fromUser.username
    userCounter.firstName = fromUser.firstName || "Unknown"
    userCounter.lastActivity = Date.now()

    // Проверяем на спам, если у пользователя меньше установленного лимита сообщений
    if (userCounter && userCounter.messageCount < this.settings.maxMessagesForSpamCheck && this.dependencies.antiSpamService) {
      const spamCheck = await this.dependencies.antiSpamService.checkMessage(userId, messageText)

      if (spamCheck.isSpam) {
        // Увеличиваем счетчик спама
        userCounter.spamCount++
        await this.handleSpamMessage(context, spamCheck.reason, userCounter)
        return
      }
    }

    // Проверяем AI чат только если бот доступен
    if (this.bot && this.dependencies.aiChatService) {
      const botInfo = await this.bot.api.getMe()
      const isMention = this.dependencies.aiChatService.isBotMention(messageText, botInfo.username)

      if (isMention || context.replyMessage?.from?.id === botInfo.id) {
        await this.handleAIChat(context)
      }
    }
  }

  /**
   * Обработка AI чата
   */
  private async handleAIChat(context: any): Promise<void> {
    if (!this.dependencies.aiChatService)
      return

    try {
      const result = await this.dependencies.aiChatService.processMessage(
        context.from.id,
        context.chat.id,
        context.text,
        context.from.username,
        context.from.firstName,
        !!context.replyMessage,
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
   * Обработка спам сообщения с логикой предупреждения и кика
   */
  private async handleSpamMessage(context: any, reason?: string, userCounter?: UserMessageCounter): Promise<void> {
    try {
      const userId = context.from?.id
      const chatId = context.chat?.id
      const firstName = userCounter?.firstName || context.from?.firstName || "Unknown"
      const username = userCounter?.username || context.from?.username

      if (!userId || !chatId || !userCounter) {
        this.logger.w("Cannot handle spam message: missing userId, chatId or userCounter")
        return
      }

      this.logger.w(`Spam detected from user ${userId} (${firstName}). Reason: ${reason}`)

      // Удаляем спам сообщение
      await context.delete()

      // Увеличиваем счетчик спама
      userCounter.spamCount++

      if (userCounter.spamCount === 1) {
        // Первое нарушение - предупреждение
        const fullName = firstName
        const displayName = username ? `${fullName}, @${username}` : fullName
        const warningText = `Хмм... 🧐\nСообщение от [${displayName}] похоже на спам.\n\nСообщение удалено. \n\n${this.config.ADMIN_USERNAME || ""}`

        if (!this.bot) {
          this.logger.e("Bot is not available for sending spam warning")
          return
        }

        const messageResult = await this.bot.api.sendMessage({
          chat_id: chatId,
          text: warningText,
          parse_mode: "HTML",
        })

        // Удаляем предупреждение через заданное время
        setTimeout(() => {
          this.deleteMessage(chatId, messageResult.message_id)
        }, this.settings.errorMessageDeleteTimeoutMs)

        this.logger.w(`User ${userId} (${firstName}) received spam warning (${userCounter.spamCount}/2)`)
      } else {
        // Второе нарушение - кик из группы
        await this.kickUserFromChat(chatId, userId, firstName)

        // Удаляем счетчик сообщений пользователя
        this.userMessageCounters.delete(userId)

        this.logger.w(`User ${userId} (${firstName}) kicked from chat for repeated spam`)
      }
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

      const escapedReason = this.escapeMarkdownV2(restriction.reason || "Не указана")
      const escapedAdminUsername = this.config.ADMIN_USERNAME ? this.escapeMarkdownV2(this.config.ADMIN_USERNAME) : ""

      const restrictionText = `Вы заблокированы\\. \n\nПричина: ${escapedReason}\n\n${escapedAdminUsername}`

      await context.reply(restrictionText, { parse_mode: "MarkdownV2" })
    } catch (error) {
      this.logger.e("Error handling restricted user:", error)
    }
  }

  /**
   * Получение или создание пользователя
   */
  private getUserOrCreate(fromUser: any): any {
    if (!fromUser?.id)
      return null

    if (!this.dependencies.repository?.exist?.(fromUser.id)) {
      return this.dependencies.repository?.newUser?.({
        id: fromUser.id,
        username: fromUser.username,
        firstname: fromUser.firstName,
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

      // В старой версии не было отдельного сообщения для успеха, только размут

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
      await this.temporaryBanUser(user.chatId, user.userId)

      // Используем старое сообщение из MemberController
      const name = user.username ? `@${user.username}` : user.firstname
      const failText = `К сожалению, ${name} выбрал неправильный вариант ответа 😢`

      if (!this.bot) {
        this.logger.e("Bot is not available for sending captcha failed message")
        return
      }

      const messageResult = await this.bot.api.sendMessage({
        chat_id: user.chatId,
        text: failText,
        parse_mode: "HTML",
      })

      // Удаляем сообщение через заданное время
      setTimeout(() => {
        this.deleteMessage(user.chatId, messageResult.message_id)
      }, this.settings.errorMessageDeleteTimeoutMs)

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
      await this.temporaryBanUser(user.chatId, user.userId)

      // Используем старое сообщение из MemberController
      const name = user.username ? `@${user.username}` : user.firstname
      const timeoutText = `К сожалению, ${name} не выбрал ни один вариант ответа 🧐`

      if (!this.bot) {
        this.logger.e("Bot is not available for sending captcha timeout message")
        return
      }

      const messageResult = await this.bot.api.sendMessage({
        chat_id: user.chatId,
        text: timeoutText,
        parse_mode: "HTML",
      })

      // Удаляем сообщение через заданное время
      setTimeout(() => {
        this.deleteMessage(user.chatId, messageResult.message_id)
      }, this.settings.errorMessageDeleteTimeoutMs)

      this.logger.w(`User ${user.userId} (${user.firstname}) captcha timeout`)
    } catch (error) {
      this.logger.e("Error handling captcha timeout:", error)
    }
  }

  /**
   * Обработка ответа от AI
   */
  private async handleAIResponse(contextId: string, response: string, messageId: number): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.sendMessage({
        chat_id: Number.parseInt(contextId),
        text: response,
        reply_parameters: { message_id: messageId },
      })
    } catch (error) {
      this.logger.e("Error sending AI response:", error)
    }
  }

  /**
   * Отправка typing индикатора
   */
  private async sendTypingAction(contextId: string): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.sendChatAction({
        chat_id: Number.parseInt(contextId),
        action: "typing",
      })
    } catch (error) {
      this.logger.e("Error sending typing action:", error)
    }
  }

  /**
   * Ограничение прав пользователя
   */
  private async restrictUser(chatId: number, userId: number): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
          can_send_messages: false,
          can_send_polls: false,
          can_send_other_messages: false,
          can_add_web_page_previews: false,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
        },
      })
    } catch (error) {
      this.logger.e("Error restricting user:", error)
    }
  }

  /**
   * Снятие ограничений с пользователя
   */
  private async unrestrictUser(chatId: number, userId: number): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.restrictChatMember({
        chat_id: chatId,
        user_id: userId,
        permissions: {
          can_send_messages: true,
          can_send_polls: true,
          can_send_other_messages: true,
          can_add_web_page_previews: true,
          can_change_info: false,
          can_invite_users: false,
          can_pin_messages: false,
        },
      })
    } catch (error) {
      this.logger.e("Error unrestricting user:", error)
    }
  }

  /**
   * Временный бан пользователя (как в старой версии)
   */
  private async temporaryBanUser(chatId: number, userId: number): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
        until_date: Math.floor(Date.now() / 1000) + this.settings.temporaryBanDurationSec,
      })
    } catch (error) {
      this.logger.e("Error banning user:", error)
    }
  }

  /**
   * Удаление пользователя из чата (кик)
   */
  private async deleteUserFromChat(chatId: number, userId: number): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
      })
    } catch (error) {
      this.logger.e("Error deleting user from chat:", error)
    }
  }

  /**
   * Кик пользователя за спам (с уведомлением)
   */
  private async kickUserFromChat(chatId: number, userId: number, userName: string): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
      })
      this.logger.i(`User ${userName} (${userId}) kicked from chat ${chatId}`)

      // Автоматический разбан через 5 секунд
      setTimeout(async () => {
        await this.unbanUserFromChat(chatId, userId, userName)
      }, 5000)
    } catch (error) {
      this.logger.e(`Error kicking user ${userName} from chat:`, error)
    }
  }

  /**
   * Разбан пользователя из чата
   */
  private async unbanUserFromChat(chatId: number, userId: number, userName: string): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.unbanChatMember({
        chat_id: chatId,
        user_id: userId,
      })
      this.logger.i(`User ${userName} (${userId}) unbanned from chat ${chatId}`)
    } catch (error) {
      this.logger.e(`Error unbanning user ${userName} from chat:`, error)
    }
  }

  /**
   * Отправка сообщения
   */
  private async sendMessage(chatId: number, text: string): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.sendMessage({
        chat_id: chatId,
        text,
      })
    } catch (error) {
      this.logger.e("Error sending message:", error)
    }
  }

  /**
   * Удаление сообщения
   */
  private async deleteMessage(chatId: number, messageId: number): Promise<void> {
    if (!this.bot)
      return

    try {
      await this.bot.api.deleteMessage({
        chat_id: chatId,
        message_id: messageId,
      })
    } catch (error) {
      this.logger.e("Error deleting message:", error)
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
      settings: this.settings,
      userMessageCountersCount: this.userMessageCounters.size,
      status: this.isRunning ? "active" : "inactive",
    }
  }

  /**
   * Обработка команды /start
   */
  private async handleStartCommand(context: any): Promise<void> {
    const _chatId = context.chat?.id

    const helpText = "🤖 **Бот активен!**\n\n"
      + "🛡️ **Защита от спама**: Автоматически проверяет сообщения на спам\n"
      + "🔐 **Система капчи**: Новые участники проходят проверку\n"
      + "🤖 **ИИ-помощник**: Отвечает на вопросы в группе\n"
      + "📊 **Статистика**: Отслеживает активность участников\n"
      + "\n"
      + "💡 **Доступные команды**:\n"
      + "• `/help` - показать справку\n"
      + "• `/stats` - статистика бота\n"
      + "• `/ban @user` - забанить пользователя (только админы)\n"
      + "• `/unban @user` - разбанить пользователя (только админы)\n"
      + "• `/mute @user` - заглушить пользователя (только админы)\n"
      + "• `/unmute @user` - снять заглушение (только админы)"

    try {
      await context.reply(helpText, { parse_mode: "Markdown" })
    } catch (error) {
      this.logger.e("Error sending start message:", error)
    }
  }

  /**
   * Обработка команды /help
   */
  private async handleHelpCommand(context: any): Promise<void> {
    const _chatId = context.chat?.id

    const helpText = "📚 **Справка по боту**"

    try {
      await context.reply(helpText, { parse_mode: "Markdown" })
    } catch (error) {
      this.logger.e("Error sending help message:", error)
    }
  }

  /**
   * Обработка команды /stats
   */
  private async handleStatsCommand(context: any): Promise<void> {
    const _chatId = context.chat?.id
    const adminCommands = "🔹 `/ban @user` - забанить пользователя\n🔹 `/unban @user` - разбанить пользователя"

    try {
      const statsText = `📊 **Статистика бота**\n\n${adminCommands}`

      await context.reply(statsText, { parse_mode: "Markdown" })
    } catch (error) {
      this.logger.e("Error sending stats:", error)
    }
  }

  /**
   * Обработка команды /ban
   */
  private async handleBanCommand(context: any): Promise<void> {
    try {
      const userId = context.from?.id
      const chatId = context.chat?.id
      const isAdmin = context.from?.username === this.config.ADMIN_USERNAME?.replace("@", "")

      if (!isAdmin) {
        await context.reply("❌ У вас нет прав для использования этой команды.")
        return
      }

      const args = context.text.split(" ")
      if (args.length < 2) {
        await context.reply("❌ Использование: /ban @username или /ban в ответ на сообщение")
        return
      }

      let targetUserId: number | null = null
      let targetUsername: string | null = null

      // Если команда в ответ на сообщение
      if (context.replyMessage) {
        targetUserId = context.replyMessage.from?.id
        targetUsername = context.replyMessage.from?.username || context.replyMessage.from?.firstName
      } else {
        // Извлекаем username из аргументов
        const username = args[1].replace("@", "")
        targetUsername = username
        // Здесь можно добавить поиск userId по username через repository
      }

      if (!targetUserId && !targetUsername) {
        await context.reply("❌ Не удалось определить пользователя для блокировки.")
        return
      }

      // Блокируем пользователя
      if (targetUserId) {
        await this.deleteUserFromChat(chatId, targetUserId)
        this.dependencies.repository?.banUser?.(targetUserId, "Заблокирован администратором")
      }

      await context.reply(`✅ Пользователь ${targetUsername} заблокирован.`)
      this.logger.i(`Admin ${userId} banned user ${targetUsername} (${targetUserId})`)
    } catch (error) {
      this.logger.e("Error handling ban command:", error)
      await context.reply("❌ Произошла ошибка при блокировке пользователя.")
    }
  }

  /**
   * Обработка команды /unban
   */
  private async handleUnbanCommand(context: any): Promise<void> {
    const _chatId = context.chat?.id
    const adminCommands = "🔹 `/ban @user` - забанить пользователя\n🔹 `/unban @user` - разбанить пользователя"

    try {
      const commandText = `📊 **Команды бота**\n\n${adminCommands}`

      await context.reply(commandText, { parse_mode: "Markdown" })
    } catch (error) {
      this.logger.e("Error in unban command:", error)
    }
  }

  /**
   * Обработка команды /mute
   */
  private async handleMuteCommand(context: any): Promise<void> {
    const _chatId = context.chat?.id

    const adminCommands = "🔹 `/mute @user` - заглушить пользователя\n🔹 `/unmute @user` - снять заглушение"

    try {
      const commandText = `📊 **Команды бота**\n\n${adminCommands}`

      await context.reply(commandText, { parse_mode: "Markdown" })
    } catch (error) {
      this.logger.e("Error in mute command:", error)
    }
  }

  /**
   * Обработка команды /unmute
   */
  private async handleUnmuteCommand(context: any): Promise<void> {
    const _chatId = context.chat?.id

    const adminCommands = "🔹 `/mute @user` - заглушить пользователя\n🔹 `/unmute @user` - снять заглушение"

    try {
      const commandText = `📊 **Команды бота**\n\n${adminCommands}`

      await context.reply(commandText, { parse_mode: "Markdown" })
    } catch (error) {
      this.logger.e("Error in unmute command:", error)
    }
  }

  /**
   * Получение текущих настроек
   */
  getSettings(): TelegramBotSettings {
    return { ...this.settings }
  }

  /**
   * Обновление настроек (для будущего использования с БД)
   */
  updateSettings(newSettings: Partial<TelegramBotSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    this.logger.i("📝 Telegram bot settings updated:", newSettings)

    // Передаем настройки капчи в CaptchaService
    if (this.dependencies.captchaService
      && (newSettings.captchaTimeoutMs !== undefined || newSettings.captchaCheckIntervalMs !== undefined)) {
      const captchaSettings: any = {}
      if (newSettings.captchaTimeoutMs !== undefined) {
        captchaSettings.timeoutMs = newSettings.captchaTimeoutMs
      }
      if (newSettings.captchaCheckIntervalMs !== undefined) {
        captchaSettings.checkIntervalMs = newSettings.captchaCheckIntervalMs
      }

      // Если CaptchaService поддерживает updateSettings
      if (typeof (this.dependencies.captchaService as any).updateSettings === "function") {
        (this.dependencies.captchaService as any).updateSettings(captchaSettings)
      }
    }
  }

  /**
   * Загрузка настроек из базы данных (для будущего использования)
   */
  async loadSettingsFromDatabase(): Promise<void> {
    try {
      // TODO: Реализовать загрузку настроек из БД
      // const settings = await this.dependencies.repository?.getSettings?.()
      // if (settings) {
      //   this.updateSettings(settings)
      // }

    } catch (error) {
      this.logger.e("❌ Error loading settings from database:", error)
    }
  }

  /**
   * Сохранение настроек в базу данных (для будущего использования)
   */
  async saveSettingsToDatabase(): Promise<void> {
    try {
      // TODO: Реализовать сохранение настроек в БД
      // await this.dependencies.repository?.saveSettings?.(this.settings)

    } catch (error) {
      this.logger.e("❌ Error saving settings to database:", error)
    }
  }

  /**
   * Получение счетчиков сообщений пользователей
   */
  getUserMessageCounters(): UserMessageCounter[] {
    return Array.from(this.userMessageCounters.values())
  }

  /**
   * Очистка счетчика сообщений для пользователя
   */
  clearUserMessageCounter(userId: number): boolean {
    const cleared = this.userMessageCounters.delete(userId)
    if (cleared) {
      this.logger.i(`Cleared message counter for user ${userId}`)
    }
    return cleared
  }

  /**
   * Очистка старых счетчиков пользователей (неактивных более 7 дней)
   */
  cleanupOldUserCounters(): void {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 часа

    for (const [userId, counter] of this.userMessageCounters.entries()) {
      if (now - counter.lastActivity > maxAge) {
        this.userMessageCounters.delete(userId)
      }
    }
  }

  /**
   * Запуск таймера для периодической очистки старых записей о спам-нарушениях
   */
  private startSpamCleanupTimer(): void {
    // Запускаем очистку каждые 30 минут
    setInterval(() => {
      this.cleanupOldUserCounters()
    }, 30 * 60 * 1000)
  }
}
