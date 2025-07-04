import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"

interface ApiServiceDependencies {
  database?: any
  telegramBot?: any
}

interface BotConfig {
  // Captcha настройки
  captchaEnabled: boolean
  captchaTimeout: number // в секундах

  // Антиспам настройки
  antispamEnabled: boolean
  antispamThreshold: number

  // AI чат настройки
  aiChatEnabled: boolean

  // Общие настройки
  welcomeMessage: string
  adminUsername: string
  logLevel: number
}

/**
 * Сервис API-сервера с админ панелью для Telegram бота
 * ПРИМЕЧАНИЕ: Для активации установите Fastify:
 * npm install fastify @fastify/cors @fastify/static
 */
export class ApiServerService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: ApiServiceDependencies
  private isRunning = false
  private hasFastify = false

  // Конфигурация бота (будет сохраняться в БД)
  private botConfig: BotConfig

  constructor(config: AppConfig, logger: Logger, dependencies: ApiServiceDependencies = {}) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Инициализируем конфиг
    this.botConfig = {
      captchaEnabled: true,
      captchaTimeout: 60,
      antispamEnabled: true,
      antispamThreshold: 5,
      aiChatEnabled: true,
      welcomeMessage: "Добро пожаловать! Пройдите простую проверку:",
      adminUsername: this.config.ADMIN_USERNAME || "",
      logLevel: 2,
    }
  }

  /**
   * Инициализация API-сервера
   */
  async initialize(): Promise<void> {
    this.logger.i("🌐 Initializing API server...")

    try {
      // Проверяем наличие Fastify
      try {
        await import("fastify")
        this.hasFastify = true
        this.logger.i("✅ Fastify available - API server can be enabled")
      } catch {
        this.logger.w("⚠️ Fastify not available. API server disabled.")
      }

      this.logger.i("✅ API server service initialized")
    }
    catch (error) {
      this.logger.e("❌ Failed to initialize API server:", error)
      // Не прерываем выполнение - сервис работает без веб-интерфейса
    }
  }

  /**
   * Запуск API-сервера
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting API server...")

    if (!this.hasFastify) {
      this.logger.w("🚫 API server not available - Fastify not installed")
      return
    }

    try {
      // TODO: Здесь будет код запуска Fastify сервера
      this.isRunning = true
      this.logger.i("✅ API server started")
    }
    catch (error) {
      this.logger.e("❌ Failed to start API server:", error)
      // Не прерываем выполнение приложения
    }
  }

  /**
   * Остановка API-сервера
   */
  async stop(): Promise<void> {
    if (this.isRunning) {
      this.logger.i("🛑 Stopping API server...")
      this.isRunning = false
      this.logger.i("✅ API server stopped")
    }
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing API server service...")
    await this.stop()
    this.logger.i("✅ API server service disposed")
  }

  /**
   * Проверка состояния сервера
   */
  isHealthy(): boolean {
    return true // Сервис всегда здоров, даже если веб-сервер отключен
  }

  /**
   * Получение информации о сервере
   */
  getServerInfo(): object {
    return {
      isRunning: this.isRunning,
      hasFastify: this.hasFastify,
      host: "0.0.0.0",
      port: this.config.PORT,
      hasDatabase: !!this.dependencies.database,
      hasTelegramBot: !!this.dependencies.telegramBot,
      status: this.hasFastify ? "ready" : "disabled",
      note: this.hasFastify ? "Web interface ready" : "Install Fastify to enable web interface",
    }
  }

  /**
   * Получение конфигурации бота (для внутреннего использования)
   */
  getBotConfig(): BotConfig {
    return { ...this.botConfig }
  }

  /**
   * Обновление конфигурации бота (для внутреннего использования)
   */
  updateBotConfig(updates: Partial<BotConfig>): void {
    this.botConfig = { ...this.botConfig, ...updates }
    this.logger.i("Bot configuration updated")
    // TODO: Сохранение в БД
    // TODO: Уведомление бота об изменениях
  }
}
