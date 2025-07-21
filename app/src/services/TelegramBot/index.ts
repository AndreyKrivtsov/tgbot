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
import { GramioBot } from "./core/GramioBot.js"
import type { EventBus } from "../../core/EventBus.js"

// Утилиты
import { SettingsManager } from "./utils/SettingsManager.js"
import { UserRestrictions } from "./utils/UserRestrictions.js"

// Feature модули
import { CaptchaManager } from "./features/CaptchaManager.js"
import { SpamDetector } from "./features/SpamDetector.js"
import { UserManager } from "./features/UserManager.js"
import { MessageDeletionManager } from "./features/MessageDeletionManager.js"

// Обработчики
import { MessageHandler } from "./handlers/MessageHandler.js"
import { MemberHandler } from "./handlers/MemberHandler.js"
import { CallbackHandler } from "./handlers/CallbackHandler.js"
import { CommandHandler } from "./handlers/CommandHandler.js"
import { ModerationEventHandler } from "./handlers/ModerationEventHandler.js"

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
  private messageDeletionManager: MessageDeletionManager | null = null

  // Обработчики
  private messageHandler: MessageHandler | null = null
  private memberHandler: MemberHandler | null = null
  private callbackHandler: CallbackHandler | null = null
  private commandHandler: CommandHandler | null = null
  private moderationEventHandler: ModerationEventHandler | null = null

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
      this.logger.w("💡 Start Redis server and check REDIS_URL in .env file")
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
        await import("gramio")
        this.hasGramIO = true

        // Создаем MessageDeletionManager если доступен Redis
        if (this.dependencies.redisService) {
          this.messageDeletionManager = new MessageDeletionManager(
            this.dependencies.redisService,
            // Временно передаем null, обновим после создания GramioBot
            undefined as any,
            this.logger,
          )
        }

        // Создаем бота через обертку с MessageDeletionManager
        this.bot = new GramioBot(this.config.BOT_TOKEN, this.logger, this.messageDeletionManager || undefined)

        // Теперь обновляем MessageDeletionManager с правильной ссылкой на бота
        if (this.messageDeletionManager) {
          // Хак для обновления приватного поля bot в MessageDeletionManager
          (this.messageDeletionManager as any).bot = this.bot
          await this.messageDeletionManager.initialize()
        }

        // Инициализируем все модули
        await this.initializeModules()

        // Настраиваем обработчики событий
        this.setupEventHandlers()

        this.logger.i("✅ Telegram bot initialized successfully")
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
      BOT_CONFIG.MESSAGE_DELETE_SHORT_TIMEOUT_MS,
      this.dependencies.antiSpamService,
    )

    // Проверяем наличие ChatRepository
    if (!this.dependencies.chatRepository) {
      this.logger.e("❌ ChatRepository is required for TelegramBot handlers")
      throw new Error("ChatRepository is required")
    }

    // Проверяем наличие ChatSettingsService
    if (!this.dependencies.chatSettingsService) {
      this.logger.e("❌ ChatSettingsService is required for TelegramBot handlers")
      throw new Error("ChatSettingsService is required")
    }

    // Инициализируем обработчики
    this.commandHandler = new CommandHandler(
      this.logger,
      this.config,
      this.userRestrictions,
      this.userManager,
      this.dependencies.chatRepository,
      this,
      this.dependencies.chatSettingsService,
      this.dependencies.chatService,
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
      this.bot,
      this.captchaManager,
    )

    this.moderationEventHandler = new ModerationEventHandler(
      this.bot,
      this.userRestrictions,
    )
  }

  /**
   * Запуск сервиса
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting TelegramBot service...")

    // Проверяем зависимости и собираем отсутствующие
    const missingServices = []
    if (!this.dependencies.captchaService) {
      missingServices.push("CaptchaService")
    }
    if (!this.dependencies.antiSpamService) {
      missingServices.push("AntiSpamService")
    }

    if (missingServices.length > 0) {
      this.logger.w(`⚠️ Optional services not available: ${missingServices.join(", ")}. Some features will be disabled.`)
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
      const botInfo = await this.bot.getMe()

      // Кешируем информацию о боте в Redis
      if (this.dependencies.redisService) {
        await this.dependencies.redisService.setBotInfo({
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
        })
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

        // Останавливаем MessageDeletionManager
        if (this.messageDeletionManager) {
          await this.messageDeletionManager.stop()
        }

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

    // Освобождаем ресурсы MessageDeletionManager
    if (this.messageDeletionManager) {
      await this.messageDeletionManager.dispose()
      this.messageDeletionManager = null
    }

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
      this.logger.w("❌ Cannot setup event handlers - missing required components")
      this.logger.w(`Bot: ${!!this.bot}, MessageHandler: ${!!this.messageHandler}, MemberHandler: ${!!this.memberHandler}, CallbackHandler: ${!!this.callbackHandler}`)
      return
    }

    this.logger.i("🔧 Setting up event handlers...")

    // Обработка сообщений
    this.bot.on("message", (context: TelegramMessageContext) => {
      this.messageHandler!.handleMessage(context)
    })

    // Обработка новых участников
    this.bot.on("new_chat_members", (context: TelegramNewMembersContext) => {
      this.logger.i("🔥 NEW_CHAT_MEMBERS event received in TelegramBotService!")
      this.memberHandler!.handleNewChatMembers(context)
    })

    // Обработка ушедших участников
    this.bot.on("left_chat_member", (context: any) => {
      this.logger.i("👋 LEFT_CHAT_MEMBER event received")
      this.memberHandler!.handleLeftChatMember(context)
    })

    // Обработка изменений участников
    this.bot.on("chat_member", (context: any) => {
      this.logger.i("👥 CHAT_MEMBER event received")
      this.memberHandler!.handleChatMember(context)
    })

    // Обработка callback запросов
    this.bot.on("callback_query", (context: any) => {
      this.callbackHandler!.handleCallbackQuery(context)
    })

    this.logger.i("✅ Event handlers setup completed")
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
      this.dependencies.chatService.onMessageResponse = (contextId: string, response: string, messageId: number, userMessageId?: number, isError?: boolean) => {
        this.messageHandler?.handleAIResponse(contextId, response, messageId, userMessageId, isError)
      }

      // Настраиваем функцию отправки typing action напрямую в AIChatService
      this.dependencies.chatService.setSendTypingAction(async (chatId: number) => {
        try {
          if (this.bot) {
            await this.bot.sendChatAction(chatId, "typing")
          }
        } catch (error) {
          this.logger.e("Error sending typing action:", error)
        }
      })
    }
  }

  /**
   * Получение информации о сервисе
   */
  async getServiceInfo(): Promise<object> {
    const memberStats = await this.memberHandler?.getMemberStats()

    // Получаем информацию о MessageDeletionManager если он есть
    let messageDeletionInfo = null
    if (this.messageDeletionManager) {
      messageDeletionInfo = await this.messageDeletionManager.getServiceInfo()
    }

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
        messageDeletionManager: !!this.messageDeletionManager,
      },
      statistics: {
        ...memberStats,
      },
      messageDeletion: messageDeletionInfo,
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
   * Очистка счетчика сообщений для пользователя
   */
  async clearUserMessageCounter(userId: number): Promise<boolean> {
    return await this.userManager.clearUserCounter(userId)
  }

  /**
   * Получение статистики модулей
   */
  async getModuleStats(): Promise<object> {
    return {
      captcha: this.captchaManager?.isAvailable() || false,
      spam: this.spamDetector?.isAvailable() || false,
      ai: this.messageHandler?.hasAIService() || false,
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
      return null
    }
    return await this.dependencies.redisService.getBotId()
  }

  /**
   * Получение полной информации о боте из кеша Redis
   */
  async getBotInfo(): Promise<{ id: number, username?: string, first_name: string } | null> {
    if (!this.dependencies.redisService) {
      return null
    }
    return await this.dependencies.redisService.getBotInfo()
  }

  /**
   * Получить администраторов чата через адаптер GramioBot
   */
  public async getChatAdministrators(chatId: number): Promise<any[]> {
    if (!this.bot)
      return []
    return await this.bot.getChatAdministrators(chatId)
  }

  /**
   * Подключение к EventBus для обработки событий модерации
   */
  setupEventBusListeners(eventBus: EventBus): void {
    if (!this.moderationEventHandler) {
      this.logger.w("⚠️ ModerationEventHandler not initialized")
      return
    }

    this.moderationEventHandler.setupEventListeners(eventBus)
    this.logger.i("✅ EventBus listeners setup completed")
  }
}
