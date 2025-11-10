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
} from "./types/index.js"
import { GramioBot } from "./core/GramioBot.js"
import type { EventBus } from "../../core/EventBus.js"
// EVENTS not used here

// Утилиты
// SettingsManager removed; inline settings are used instead
// UserRestrictions removed; use TelegramModerationAdapter instead

// Feature модули
// Utils for user and message management
// UserManager removed; counters moved to AntiSpamService/UserCounters.ts
import { MessageDeletionManager } from "./utils/MessageDeletionManager.js"

// Обработчики
import { MessageHandler } from "./handlers/MessageHandler.js"
import { MemberHandler } from "./handlers/MemberHandler.js"
import { CallbackHandler } from "./handlers/CallbackHandler.js"
import { CommandHandler } from "./handlers/CommandHandler.js"
// import type { CaptchaActionsPort } from "../CaptchaService/index.js"

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
  private settings: TelegramBotSettings
  // private userRestrictions: removed; use TelegramModerationAdapter in handlers/adapters

  // Feature модули
  // feature managers removed
  private messageDeletionManager: MessageDeletionManager | null = null

  // Обработчики
  private messageHandler: MessageHandler | null = null
  private memberHandler: MemberHandler | null = null
  private callbackHandler: CallbackHandler | null = null
  private commandHandler: CommandHandler | null = null
  private eventBusRef: EventBus | null = null

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: TelegramBotDependencies = {},
    settings?: Partial<TelegramBotSettings>,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Инициализируем настройки (инлайн вместо SettingsManager)
    this.settings = {
      captchaTimeoutMs: BOT_CONFIG.CAPTCHA_TIMEOUT_MS,
      captchaCheckIntervalMs: BOT_CONFIG.CAPTCHA_CHECK_INTERVAL_MS,
      errorMessageDeleteTimeoutMs: BOT_CONFIG.MESSAGE_DELETE_LONG_TIMEOUT_MS,
      deleteSystemMessages: true,
      temporaryBanDurationSec: BOT_CONFIG.TEMPORARY_BAN_DURATION_SEC,
      autoUnbanDelayMs: BOT_CONFIG.AUTO_UNBAN_DELAY_MS,
      maxMessagesForSpamCheck: BOT_CONFIG.MAX_MESSAGES_FOR_SPAM_CHECK,
      ...(settings || {}),
    }
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
            this.logger,
          )
        }

        // Создаем бота через обертку с MessageDeletionManager
        this.bot = new GramioBot(this.config.BOT_TOKEN, this.logger, this.messageDeletionManager || undefined)

        // Теперь устанавливаем бота в MessageDeletionManager корректным способом
        if (this.messageDeletionManager) {
          this.messageDeletionManager.setBot(this.bot)
          await this.messageDeletionManager.initialize()
        }

        // Сохраняем EventBus для использования в initializeModules
        let pendingBus: EventBus | undefined
        if ((this as any)._pendingEventBus) {
          pendingBus = (this as any)._pendingEventBus as EventBus
          this.eventBusRef = pendingBus
          ;(this as any)._pendingEventBus = undefined
        }

        // Инициализируем все модули (требует eventBus для нового обработчика)
        await this.initializeModules()

        // Подключаем EventBus слушатели после инициализации модулей
        if (pendingBus) {
          this.setupEventBusListeners(pendingBus)
        }

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

    const settings = this.settings

    // Для обработчиков требуется EventBus
    const eventBus = this.eventBusRef as EventBus

    // Инициализируем утилиты (moderation uses adapters in handlers)

    // feature managers no longer initialized

    // Проверяем наличие ChatRepository
    if (!this.dependencies.chatRepository) {
      this.logger.e("❌ ChatRepository is required for TelegramBot handlers")
      throw new Error("ChatRepository is required")
    }

    // Инициализируем обработчики
    this.commandHandler = new CommandHandler(
      this.logger,
      this.config,
      null as any,
      this.dependencies.chatRepository,
      this,
      this.dependencies.chatService,
      eventBus,
    )

    // Для нового обработчика требуется EventBus
    this.messageHandler = new MessageHandler(
      this.logger,
      this.config,
      this.bot,
      settings,
      this.dependencies.chatRepository,
      null as any,
      this,
      eventBus,
      this.dependencies.antiSpamService,
      this.commandHandler,
      this.dependencies.chatService,
    )

    this.memberHandler = new MemberHandler(
      this.logger,
      settings,
      this.bot,
      null as any,
      this.dependencies.chatRepository,
      this.dependencies.captchaService,
      eventBus,
    )

    this.callbackHandler = new CallbackHandler(
      this.logger,
      this.bot,
      this.dependencies.captchaService,
    )

    // Подключаем AIChatService к EventBus (он может слушать события напрямую)
    try {
      (this.dependencies.chatService as any)?.setupEventBusListeners?.(eventBus)
    } catch {}
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

    if (this.isRunning) {
      this.logger.w("TelegramBot service is already running")
      return
    }

    try {
      await this.bot.start()
      this.isRunning = true

      // Получаем информацию о боте
      let botInfo: any = null
      try {
        botInfo = await this.bot.getMe()
      } catch (error: any) {
        this.logger.e("❌ Failed to get bot info:", error)
        throw error
      }

      // Кешируем информацию о боте в Redis
      if (this.dependencies.redisService) {
        await this.dependencies.redisService.setBotInfo({
          id: botInfo.id,
          username: botInfo.username,
          first_name: botInfo.first_name,
        })
      }

      // Счетчики обрабатываются в AntiSpamService

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

        // Счетчики обрабатываются в AntiSpamService

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

    // this.logger.i("🔧 Setting up event handlers...")

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
      // this.logger.i("👥 CHAT_MEMBER event received")
      this.memberHandler!.handleChatMember(context)
    })

    // Обработка callback запросов
    this.bot.on("callback_query", (context: any) => {
      this.callbackHandler!.handleCallbackQuery(context)
    })

    this.logger.i("✅ Event handlers setup completed")
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
      settings: this.settings,
      dependencies: {
        captcha: !!this.dependencies.captchaService,
        antiSpam: !!this.dependencies.antiSpamService,
        chat: !!this.dependencies.chatService,
        redis: !!this.dependencies.redisService,
      },
      modules: {
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
    return { ...this.settings }
  }

  /**
   * Обновление настроек
   */
  updateSettings(newSettings: Partial<TelegramBotSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
  }

  // clearUserMessageCounter removed; counters managed by AntiSpamService

  /**
   * Получение статистики модулей
   */
  async getModuleStats(): Promise<object> {
    return {
      captcha: !!this.dependencies.captchaService,
      spam: !!this.dependencies.antiSpamService,
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
   * Отправка индикатора печати в чат
   */
  async sendTyping(chatId: number): Promise<void> {
    if (!this.bot)
      return
    try {
      await this.bot.sendChatAction(chatId, "typing" as any)
    } catch {
      // не прерываем выполнение цепочки
    }
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
    this.eventBusRef = eventBus

    // Инициализируем TelegramActionsAdapter для обработки событий
    if (this.bot) {
      import("./adapters/TelegramActionsAdapter.js").then(({ TelegramActionsAdapter }) => {
        const         actionsAdapter = new TelegramActionsAdapter(
          this.bot!,
          this.logger,
          eventBus,
        )
        actionsAdapter.initialize()
      }).catch((error) => {
        this.logger.e("Error loading TelegramActionsAdapter:", error)
      })
    }

    // Подписка на результаты AI модерации (batch)
    this.logger.i("✅ EventBus listeners setup completed")
  }
}
