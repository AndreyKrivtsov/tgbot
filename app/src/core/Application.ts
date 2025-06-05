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
      const { DatabaseService } = await import("../services/DatabaseService.js")
      return new DatabaseService(this.config, this.logger)
    })

    // Cache Service  
    this.container.register("cache", async () => {
      const { CacheService } = await import("../services/CacheService.js")
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
      const { AIService } = await import("../services/AIService.js")
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
      const { CaptchaService } = await import("../services/CaptchaService.js")
      const repository = await this.container.getAsync("repository")
      
      return new CaptchaService(this.config, this.logger, {
        repository
      })
    })

    // Anti-Spam Service
    this.container.register("antiSpam", async () => {
      const { AntiSpamService } = await import("../services/AntiSpamService.js")
      const aiService = await this.container.getAsync("aiService")
      
      return new AntiSpamService(this.config, this.logger, {
        aiService
      })
    })

    // AI Chat Service
    this.container.register("aiChat", async () => {
      const { AIChatService } = await import("../services/AIChatService.js")
      const aiService = await this.container.getAsync("aiService")
      const database = await this.container.getAsync("database")
      
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
      const { TelegramBotService } = await import("../services/TelegramBotService.js")
      const repository = await this.container.getAsync("repository")
      const captchaService = await this.container.getAsync("captcha")
      const antiSpamService = await this.container.getAsync("antiSpam")
      const aiChatService = await this.container.getAsync("aiChat")
      
      return new TelegramBotService(this.config, this.logger, {
        repository,
        captchaService: captchaService as any,
        antiSpamService: antiSpamService as any,
        aiChatService: aiChatService as any
      })
    })

    // Web Server Service
    this.container.register("webServer", async () => {
      const { WebServerService } = await import("../services/WebServerService.js")
      const database = await this.container.getAsync("database")
      const repository = await this.container.getAsync("repository")
      const telegramBot = await this.container.getAsync("telegramBot")
      
      return new WebServerService(this.config, this.logger, {
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