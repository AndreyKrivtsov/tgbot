import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { GroupManagementService } from "../GroupManagementService/index.js"
import type { ChatConfigurationService } from "../ChatConfigurationService/index.js"
import type { AuthorizationService } from "../AuthorizationService/index.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import { registerRoutes } from "./routes/registerRoutes.js"

interface ApiServiceDependencies {
  database?: any
  telegramBot?: any
  groupManagement?: GroupManagementService
  chatConfiguration?: ChatConfigurationService
  authorizationService?: AuthorizationService
  chatRepository?: ChatRepository
}

/**
 * Сервис Web API для админ панели Telegram бота
 * ПРИМЕЧАНИЕ: Для активации установите Fastify:
 * npm install fastify @fastify/cors @fastify/static
 */
export class WebApiService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: ApiServiceDependencies
  private isRunning = false
  private hasFastify = false
  private server?: any

  constructor(config: AppConfig, logger: Logger, dependencies: ApiServiceDependencies = {}) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
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
      const { default: fastify } = await import("fastify")
      this.server = fastify()
      registerRoutes(this.server, {
        groupManagement: this.dependencies.groupManagement,
        chatConfiguration: this.dependencies.chatConfiguration,
        authorizationService: this.dependencies.authorizationService,
        chatRepository: this.dependencies.chatRepository,
      }, this.logger)
      await this.server.listen({
        port: this.config.PORT,
        host: "0.0.0.0",
      })
      this.isRunning = true
      this.logger.i(`✅ API server started on http://0.0.0.0:${this.config.PORT}`)
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
      if (this.server) {
        try {
          await this.server.close()
        } catch (error) {
          this.logger.e("Error while stopping API server:", error)
        }
        this.server = undefined
      }
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
}
