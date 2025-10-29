import { Logger } from "./helpers/Logger.js"
import { config } from "./config.js"
import { Container } from "./core/Container.js"
import { Application } from "./core/Application.js"

/**
 * Главная точка входа в приложение
 * Инициализирует все компоненты и запускает приложение
 */
export class App {
  private container: Container
  private application?: Application
  private logger: Logger
  private config: typeof config

  constructor() {
    this.logger = new Logger("App")
    this.container = new Container()
    this.config = config
  }

  /**
   * Инициализация приложения
   */
  private async initialize(): Promise<void> {
    this.logger.i("🔧 Initializing application...")

    try {
      // Создаем и регистрируем основные компоненты
      this.container.register("logger", this.logger)
      this.container.register("config", this.config)

      // Создаем Application с config
      this.application = new Application(this.container, this.logger, this.config)

      // Регистрируем все сервисы
      await this.application.initialize()

      // Инициализируем контейнер (создает экземпляры и вызывает initialize)
      await this.container.initialize()

      this.logger.i("✅ Application initialized successfully")
    } catch (error) {
      this.logger.e("❌ Failed to initialize application:", error)
      throw error
    }
  }

  /**
   * Запуск приложения
   */
  async start(): Promise<void> {
    try {
      this.logger.i("🔥 Starting application...")

      if (!this.application) {
        throw new Error("Application not initialized")
      }

      await this.application.start()

      this.logger.i("✅ Application started successfully")
      this.logger.i(`🌍 Environment: ${config.NODE_ENV}`)
      this.logger.i(`🤖 Bot mode: ${config.BOT_TOKEN ? "enabled" : "disabled"}`)
    }
    catch (error) {
      this.logger.e("❌ Failed to start application:", error)
      throw error
    }
  }

  /**
   * Остановка приложения
   */
  async stop(): Promise<void> {
    try {
      this.logger.i("🛑 Stopping application...")

      if (this.application) {
        await this.application.stop()
      }
      await this.container.dispose()

      this.logger.i("✅ Application stopped successfully")
    }
    catch (error) {
      this.logger.e("❌ Error during application shutdown:", error)
      throw error
    }
  }

  /**
   * Graceful shutdown обработчик
   */
  setupGracefulShutdown(): void {
    const signals = ["SIGINT", "SIGTERM", "SIGQUIT"] as const

    signals.forEach((signal) => {
      process.on(signal, async () => {
        this.logger.i(`📡 Received ${signal}, initiating graceful shutdown...`)

        try {
          await this.stop()
          process.exit(0)
        }
        catch (error) {
          this.logger.e("❌ Error during graceful shutdown:", error)
          process.exit(1)
        }
      })
    })

    // Обработка необработанных ошибок
    process.on("uncaughtException", (error) => {
      this.logger.e("💥 Uncaught Exception:", error)
      this.stop().finally(() => process.exit(1))
    })

    process.on("unhandledRejection", (reason, promise) => {
      this.logger.e("💥 Unhandled Rejection at:", promise, "reason:", reason)
      this.stop().finally(() => process.exit(1))
    })

    this.logger.i("🛡️ Graceful shutdown handlers registered")
  }

  /**
   * Запуск полного жизненного цикла приложения
   */
  async run(): Promise<void> {
    try {
      // Настраиваем graceful shutdown
      this.setupGracefulShutdown()

      // Инициализируем и запускаем
      await this.initialize()
      await this.start()

      this.logger.i("🎉 Application is running!")
    }
    catch (error) {
      this.logger.e("💀 Fatal error during application startup:", error)
      await this.stop()
      process.exit(1)
    }
  }
}

// Функция для создания и запуска приложения
export async function createApp(): Promise<App> {
  const app = new App()
  return app
}

// Экспорт для использования в index.ts
export { App as default }
