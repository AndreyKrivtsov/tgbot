import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"

/**
 * @deprecated
 * Сервис кэширования
 */
export class CacheService implements IService {
  private config: AppConfig
  private logger: Logger
  private cache: Map<string, any> = new Map()
  private isConnected = false

  constructor(config: AppConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  /**
   * Инициализация сервиса кэша
   */
  async initialize(): Promise<void> {
    this.logger.i("🗃️ Initializing cache service...")
    this.logger.i("✅ Cache service initialized")
  }

  /**
   * Запуск сервиса кэша
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting cache service...")

    try {
      // TODO: Подключение к Redis если нужно
      this.isConnected = true
      this.logger.i("✅ Cache service started")
    } catch (error) {
      this.logger.e("❌ Failed to start cache service:", error)
      throw error
    }
  }

  /**
   * Остановка сервиса кэша
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping cache service...")
    this.isConnected = false
    this.cache.clear()
    this.logger.i("✅ Cache service stopped")
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing cache service...")
    await this.stop()
    this.logger.i("✅ Cache service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.isConnected
  }

  /**
   * Установка значения в кэш
   */
  set(key: string, value: any, ttl?: number): void {
    this.cache.set(key, {
      value,
      expires: ttl ? Date.now() + ttl * 1000 : null,
    })
  }

  /**
   * Получение значения из кэша
   */
  get(key: string): any {
    const item = this.cache.get(key)
    if (!item)
      return null

    if (item.expires && Date.now() > item.expires) {
      this.cache.delete(key)
      return null
    }

    return item.value
  }

  /**
   * Удаление значения из кэша
   */
  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  /**
   * Очистка кэша
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Получение статистики кэша
   */
  getStats(): object {
    return {
      size: this.cache.size,
      isConnected: this.isConnected,
      status: this.isConnected ? "active" : "inactive",
    }
  }
}
