import type { Container } from "./Container.js"
import type { Logger } from "../helpers/Logger.js"
import type { AppConfig } from "../config.js"

/**
 * Оркестратор для регистрации и управления сервисами приложения
 */
export class Application {
  private container: Container
  private logger: Logger
  private config: AppConfig

  constructor(container: Container, logger: Logger, config: AppConfig) {
    this.container = container
    this.logger = logger
    this.config = config
  }

  /**
   * Инициализация всех сервисов приложения
   */
  async initialize(): Promise<void> {
    this.logger.i("🏗️ Setting up application services...")

    // Регистрируем основные сервисы
    await this.registerCoreServices()

    // Регистрируем сервисы инфраструктуры
    await this.registerInfrastructureServices()

    // Регистрируем бизнес-сервисы
    await this.registerBusinessServices()

    // Регистрируем веб-сервисы
    await this.registerWebServices()

    this.logger.i("✅ Application services registered")
  }

  /**
   * Запуск приложения
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting application services...")

    // Запускаем все сервисы через контейнер
    await this.container.start()

    this.logger.i("✅ Application services started")
  }

  /**
   * Остановка приложения
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping application services...")

    // Останавливаем все сервисы через контейнер
    await this.container.stop()

    this.logger.i("✅ Application services stopped")
  }

  /**
   * Регистрация core сервисов
   */
  async registerCoreServices(): Promise<void> {
    this.logger.i("📦 Registering core services...")

    // Repository
    this.container.register("repository", async () => {
      const { Repository } = await import("../repository/Repository.js")
      return new Repository(this.logger)
    })

    // Database Service
    this.container.register("database", async () => {
      const { DatabaseService } = await import("../services/DatabaseService/index.js")
      return new DatabaseService(this.config, this.logger)
    })

    // Cache Service  
    this.container.register("cache", async () => {
      const { CacheService } = await import("../services/CacheService/index.js")
      return new CacheService(this.config, this.logger)
    })

    this.logger.i("✅ Core services registered")
  }

  /**
   * Регистрация infrastructure сервисов
   */
  async registerInfrastructureServices(): Promise<void> {
    this.logger.i("🔧 Registering infrastructure services...")

    // AI Service
    this.container.register("aiService", async () => {
      const { AIService } = await import("../services/AI/index.js")
      return new AIService(this.config, this.logger)
    })

    this.logger.i("✅ Infrastructure services registered")
  }

  /**
   * Регистрация business сервисов
   */
  async registerBusinessServices(): Promise<void> {
    this.logger.i("🏢 Registering business services...")

    // Captcha Service
    this.container.register("captcha", async () => {
      const { CaptchaService } = await import("../services/CaptchaService/index.js")
      const repository = await this.container.getAsync("repository")
      
      // Настройки капчи (можно перенести в БД позже)
      const captchaSettings = {
        timeoutMs: 60000,        // 60 секунд
        checkIntervalMs: 5000    // 5 секунд
      }
      
      return new CaptchaService(this.config, this.logger, {
        repository
      }, captchaSettings)
    })

    // Anti-Spam Service
    this.container.register("antiSpam", async () => {
      const { AntiSpamService } = await import("../services/AntiSpamService/index.js")
      
      // Настройки антиспама (можно перенести в БД позже)
      const antiSpamSettings = {
        timeoutMs: 5000,        // 5 секунд
        maxRetries: 2,          // 2 попытки
        retryDelayMs: 1000      // 1 секунда
      }
      
      this.logger.i("🛡️ [ANTISPAM DEBUG] Registering AntiSpamService with settings:", JSON.stringify(antiSpamSettings, null, 2))
      this.logger.i("🛡️ [ANTISPAM DEBUG] ANTISPAM_URL from config:", this.config.ANTISPAM_URL)
      
      return new AntiSpamService(this.config, this.logger, {}, antiSpamSettings)
    })

    // AI Chat Service
    this.container.register("aiChat", async () => {
      const { AIChatService } = await import("../services/AIChatService/index.js")
      const aiService = await this.container.getAsync("aiService")
      const database = await this.container.getAsync("database") as any
      
      return new AIChatService(this.config, this.logger, {
        aiService,
        database
      })
    })

    this.logger.i("✅ Business services registered")
  }

  /**
   * Регистрация web сервисов
   */
  async registerWebServices(): Promise<void> {
    this.logger.i("🌐 Registering web services...")

    // Telegram Bot Service (с зависимостями)
    this.container.register("telegramBot", async () => {
      const { TelegramBotService } = await import("../services/TelegramBot/index.js")
      const repository = await this.container.getAsync("repository")
      const captchaService = await this.container.getAsync("captcha")
      const antiSpamService = await this.container.getAsync("antiSpam")
      const aiChatService = await this.container.getAsync("aiChat")
      
      // Настройки Telegram бота (можно перенести в БД позже)
      const botSettings = {
        captchaTimeoutMs: 60000,              // 60 секунд
        captchaCheckIntervalMs: 5000,         // 5 секунд  
        errorMessageDeleteTimeoutMs: 60000,   // 60 секунд
        deleteSystemMessages: true,           // Удалять системные сообщения
        temporaryBanDurationSec: 40,          // 40 секунд
        autoUnbanDelayMs: 5000,               // 5 секунд
        maxMessagesForSpamCheck: 5            // Проверять антиспамом первые 5 сообщений
      }
      
      return new TelegramBotService(this.config, this.logger, {
        repository,
        captchaService: captchaService as any,
        antiSpamService: antiSpamService as any,
        aiChatService: aiChatService as any
      }, botSettings)
    })

    // API Server Service
    this.container.register("apiServer", async () => {
      const { ApiServerService } = await import("../services/ApiServerService/index.js")
      const database = await this.container.getAsync("database")
      const repository = await this.container.getAsync("repository")
      const telegramBot = await this.container.getAsync("telegramBot")
      
      return new ApiServerService(this.config, this.logger, {
        database,
        repository,
        telegramBot
      })
    })

    this.logger.i("✅ Web services registered")
  }

  /**
   * Получение контейнера (для использования в других частях приложения)
   */
  getContainer(): Container {
    return this.container
  }
} 