import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import { BOT_CONFIG } from "../../constants.js"
import type {
  TelegramBot,
  TelegramBotDependencies,
  TelegramBotSettings,
  TelegramMessageContext,
  TelegramNewMembersContext,
  UserMessageCounter,
} from "./types/index.js"

// Утилиты
import { SettingsManager } from "./utils/SettingsManager.js"
import { UserRestrictions } from "./utils/UserRestrictions.js"

// Feature модули
import { CaptchaManager } from "./features/CaptchaManager.js"
import { SpamDetector } from "./features/SpamDetector.js"
import { UserManager } from "./features/UserManager.js"

// Обработчики
import { MessageHandler } from "./handlers/MessageHandler.js"
import { MemberHandler } from "./handlers/MemberHandler.js"
import { CallbackHandler } from "./handlers/CallbackHandler.js"
import { CommandHandler } from "./handlers/CommandHandler.js"

/**
 * Сервис Telegram бота с модульной архитектурой
 */
export class TelegramBotService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: TelegramBotDependencies
  private bot: TelegramBot | null = null
  private isRunning = false
  private hasGramIO = false

  // Управляющие модули
  private settingsManager: SettingsManager
  private userRestrictions: UserRestrictions | null = null

  // Feature модули
  private captchaManager: CaptchaManager | null = null
  private spamDetector: SpamDetector | null = null
  private userManager: UserManager

  // Обработчики
  private messageHandler: MessageHandler | null = null
  private memberHandler: MemberHandler | null = null
  private callbackHandler: CallbackHandler | null = null
  private commandHandler: CommandHandler | null = null

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: TelegramBotDependencies = {},
    settings?: Partial<TelegramBotSettings>,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Инициализируем менеджер настроек
    this.settingsManager = new SettingsManager(settings || {}, logger, dependencies)

    // Инициализируем менеджер пользователей с Redis
    if (!dependencies.redisService) {
      this.logger.e("❌ RedisService is required for UserManager")
      this.logger.w("💡 To fix this:")
      this.logger.w("   1. Ensure Redis server is running (docker run -d -p 6379:6379 redis:7-alpine)")
      this.logger.w("   2. Check REDIS_URL in .env file")
      this.logger.w("   3. Restart the application")
      throw new Error("RedisService is required for UserManager")
    }
    this.userManager = new UserManager(logger, dependencies.redisService)
  }

  /**
   * Инициализация бота и всех модулей
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

        // Инициализируем все модули
        await this.initializeModules()

        // Настраиваем обработчики событий
        this.setupEventHandlers()

        this.logger.i("✅ Telegram bot initialized with modular architecture")
      } catch {
        this.logger.w("⚠️ GramIO not available. Bot service disabled.")
      }
    } catch (error) {
      this.logger.e("❌ Failed to initialize Telegram bot:", error)
      // Не прерываем выполнение приложения
    }
  }

  /**
   * Инициализация всех модулей
   */
  private async initializeModules(): Promise<void> {
    if (!this.bot) {
      return
    }

    const settings = this.settingsManager.getSettings()

    // Инициализируем утилиты
    this.userRestrictions = new UserRestrictions(this.bot, this.logger)

    // Инициализируем feature модули
    this.captchaManager = new CaptchaManager(
      this.logger,
      this.config,
      this.bot,
      this.userRestrictions,
      this.dependencies.captchaService,
    )

    this.spamDetector = new SpamDetector(
      this.logger,
      this.config,
      this.bot,
      this.userRestrictions,
      this.userManager,
      settings.errorMessageDeleteTimeoutMs,
      this.dependencies.antiSpamService,
    )

    // Проверяем наличие ChatAiRepository
    if (!this.dependencies.chatRepository) {
      this.logger.e("❌ ChatAiRepository is required for TelegramBot handlers")
      throw new Error("ChatAiRepository is required")
    }

    // Инициализируем обработчики
    this.commandHandler = new CommandHandler(
      this.logger,
      this.config,
      this.userRestrictions,
      this.userManager,
      this.dependencies.chatRepository,
      this,
    )

    this.messageHandler = new MessageHandler(
      this.logger,
      this.config,
      this.bot,
      settings,
      this.userManager,
      this.dependencies.chatRepository,
      this.spamDetector,
      this.commandHandler,
      this.dependencies.chatService,
    )

    this.memberHandler = new MemberHandler(
      this.logger,
      settings,
      this.captchaManager,
      this.userRestrictions,
      this.userManager,
      this.dependencies.chatRepository,
      this.dependencies.captchaService,
    )

    this.callbackHandler = new CallbackHandler(
      this.logger,
      this.captchaManager,
    )

    this.logger.i("✅ All modules initialized")
  }

  /**
   * Запуск сервиса
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting TelegramBot service...")

    // Проверяем зависимости
    if (!this.dependencies.captchaService) {
      this.logger.w("⚠️ CaptchaService is not available - captcha functionality will be disabled")
    }

    if (!this.dependencies.antiSpamService) {
      this.logger.w("⚠️ AntiSpamService is not available - spam protection disabled")
    }

    if (!this.hasGramIO || !this.bot) {
      this.logger.w("🚫 Telegram bot not available (GramIO not installed or BOT_TOKEN not set)")
      return
    }

    // Настраиваем колбэки для сервисов
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

      // Кешируем информацию о боте в Redis
      if (this.dependencies.redisService) {
        await this.dependencies.redisService.setBotInfo({
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
        })
        this.logger.i(`📝 Bot info cached: ID=${botInfo.id}, Username=@${botInfo.username}`)
      }

      // Запускаем автоматическую очистку старых записей
      this.userManager.startCleanupTimer()

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

        // Останавливаем автоматическую очистку
        this.userManager.stopCleanupTimer()

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

    // Освобождаем ресурсы модулей
    this.userManager.dispose()

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
    if (!this.bot || !this.messageHandler || !this.memberHandler || !this.callbackHandler) {
      return
    }

    // Обработка сообщений
    this.bot.on("message", (context: TelegramMessageContext) => {
      this.messageHandler!.handleMessage(context)
    })

    // Обработка новых участников
    this.bot.on("new_chat_members", (context: TelegramNewMembersContext) => {
      this.memberHandler!.handleNewChatMembers(context)
    })

    // Обработка ушедших участников
    this.bot.on("left_chat_member", (context: any) => {
      this.memberHandler!.handleLeftChatMember(context)
    })

    // Обработка изменений участников
    this.bot.on("chat_member", (context: any) => {
      this.memberHandler!.handleChatMember(context)
    })

    // Обработка callback запросов
    this.bot.on("callback_query", (context: any) => {
      this.callbackHandler!.handleCallback(context)
    })

    this.logger.i("✅ Event handlers configured")
  }

  /**
   * Настройка колбэков для сервисов
   */
  private setupServiceCallbacks(): void {
    // Колбэки для CaptchaService
    if (this.dependencies.captchaService && this.captchaManager) {
      this.dependencies.captchaService.onCaptchaTimeout = (_user) => {
        this.captchaManager?.handleCaptchaTimeout(_user)
      }

      this.dependencies.captchaService.onCaptchaSuccess = (_user) => {
        // Обработка будет через CaptchaManager
      }

      this.dependencies.captchaService.onCaptchaFailed = (_user) => {
        // Обработка будет через CaptchaManager
      }
    }

    // Колбэки для ChatService
    if (this.dependencies.chatService && this.messageHandler) {
      this.dependencies.chatService.onMessageResponse = (contextId: string, response: string, messageId: number) => {
        this.messageHandler?.handleAIResponse(contextId, response, messageId)
      }

      this.dependencies.chatService.onTypingStart = (contextId: string) => {
        this.messageHandler?.sendTypingAction(contextId)
      }

      this.dependencies.chatService.onTypingStop = (_contextId: string) => {
        // Можно реализовать остановку typing индикатора если нужно
      }
    }
  }

  /**
   * Получение информации о сервисе
   */
  async getServiceInfo(): Promise<object> {
    const userStats = await this.userManager.getAllUserCounters()
    const spamStats = await this.spamDetector?.getSpamStats()
    const memberStats = await this.memberHandler?.getMemberStats()

    return {
      name: "TelegramBotService",
      version: BOT_CONFIG.VERSION,
      isRunning: this.isRunning,
      hasBot: !!this.bot,
      settings: this.settingsManager.getSettings(),
      dependencies: {
        captcha: !!this.dependencies.captchaService,
        antiSpam: !!this.dependencies.antiSpamService,
        chat: !!this.dependencies.chatService,
        redis: !!this.dependencies.redisService,
      },
      modules: {
        captchaManager: !!this.captchaManager,
        spamDetector: !!this.spamDetector,
        userManager: !!this.userManager,
        messageHandler: !!this.messageHandler,
        memberHandler: !!this.memberHandler,
        callbackHandler: !!this.callbackHandler,
      },
      statistics: {
        totalUsers: userStats.length,
        ...spamStats,
        ...memberStats,
      },
    }
  }

  /**
   * Получение текущих настроек
   */
  getSettings(): TelegramBotSettings {
    return this.settingsManager.getSettings()
  }

  /**
   * Обновление настроек
   */
  updateSettings(newSettings: Partial<TelegramBotSettings>): void {
    this.settingsManager.updateSettings(newSettings)
  }

  /**
   * Получение счетчиков сообщений пользователей
   */
  async getUserMessageCounters(): Promise<UserMessageCounter[]> {
    return await this.userManager.getAllUserCounters()
  }

  /**
   * Очистка счетчика сообщений для пользователя
   */
  async clearUserMessageCounter(userId: number): Promise<boolean> {
    return await this.userManager.clearUserCounter(userId)
  }

  /**
   * Получение статистики модулей
   */
  async getModuleStats(): Promise<object> {
    const userCounters = await this.userManager.getAllUserCounters()
    return {
      captcha: this.captchaManager?.isAvailable() || false,
      spam: this.spamDetector?.isAvailable() || false,
      ai: this.messageHandler?.hasAIService() || false,
      userCount: userCounters.length,
    }
  }

  /**
   * Получение API бота для прямого взаимодействия
   */
  getBotApi() {
    if (!this.bot) {
      throw new Error("Bot is not initialized")
    }
    return this.bot.api
  }

  /**
   * Получение ID бота из кеша Redis
   */
  async getBotId(): Promise<number | null> {
    if (!this.dependencies.redisService) {
      this.logger.w("Redis service not available for bot ID lookup")
      return null
    }
    return await this.dependencies.redisService.getBotId()
  }

  /**
   * Получение полной информации о боте из кеша Redis
   */
  async getBotInfo(): Promise<{ id: number, username?: string, first_name: string } | null> {
    if (!this.dependencies.redisService) {
      this.logger.w("Redis service not available for bot info lookup")
      return null
    }
    return await this.dependencies.redisService.getBotInfo()
  }
}
