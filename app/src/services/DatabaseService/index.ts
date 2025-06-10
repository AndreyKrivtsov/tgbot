import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../../db/schema.js"

/**
 * Сервис базы данных с PostgreSQL + Drizzle ORM
 */
export class DatabaseService implements IService {
  private config: AppConfig
  private logger: Logger
  private sql: postgres.Sql | null = null
  private db: ReturnType<typeof drizzle> | null = null
  private isConnected = false

  constructor(config: AppConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  /**
   * Инициализация сервиса базы данных
   */
  async initialize(): Promise<void> {
    this.logger.i("🗄️ Initializing database service...")

    try {
      // Проверяем наличие DATABASE_URL
      if (!this.config.DATABASE_URL) {
        this.logger.w("⚠️ DATABASE_URL not configured - database service disabled")
        return
      }

      // Создаем подключение к PostgreSQL
      this.sql = postgres(this.config.DATABASE_URL, {
        max: 20, // Максимум соединений в пуле
        idle_timeout: 20, // Таймаут неактивных соединений (секунды)
        connect_timeout: 10, // Таймаут подключения (секунды)
        prepare: true, // Подготовленные запросы для производительности
        transform: {
          undefined: null, // Преобразование undefined в NULL
        },
      })

      // Создаем Drizzle ORM экземпляр
      this.db = drizzle(this.sql, {
        schema,
        logger: this.config.NODE_ENV === "development",
      })

      this.logger.i("✅ Database service initialized")
    } catch (error) {
      this.logger.e("❌ Failed to initialize database service:", error)
      throw error
    }
  }

  /**
   * Запуск сервиса базы данных
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting database service...")

    if (!this.sql || !this.db) {
      this.logger.w("🚫 Database not configured, skipping connection test")
      return
    }

    try {
      // Тестируем подключение
      await this.sql`SELECT 1 as test`
      this.isConnected = true

      this.logger.i("✅ Database service started - connection successful")

      // Логируем информацию о подключении
      const connectionInfo = await this.getConnectionInfo()
      this.logger.i(`📊 Database info: ${JSON.stringify(connectionInfo)}`)
    } catch (error) {
      this.logger.e("❌ Failed to start database service:", error)
      throw error
    }
  }

  /**
   * Остановка сервиса базы данных
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping database service...")

    try {
      if (this.sql) {
        await this.sql.end()
        this.sql = null
        this.db = null
        this.isConnected = false
      }

      this.logger.i("✅ Database service stopped")
    } catch (error) {
      this.logger.e("Error stopping database service:", error)
    }
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing database service...")
    await this.stop()
    this.logger.i("✅ Database service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.isConnected && this.sql !== null && this.db !== null
  }

  /**
   * Получение экземпляра Drizzle ORM
   */
  getDb() {
    if (!this.db) {
      throw new Error("Database not initialized")
    }
    return this.db
  }

  /**
   * Получение информации о подключении
   */
  async getConnectionInfo(): Promise<object> {
    if (!this.sql) {
      return { isConnected: false, status: "not_configured" }
    }

    try {
      const result = await this.sql`
        SELECT 
          version() as version,
          current_database() as database,
          current_user as user,
          inet_server_addr() as server_addr,
          inet_server_port() as server_port
      `

      if (!result || result.length === 0) {
        return {
          isConnected: this.isConnected,
          status: "error",
          error: "No connection info available",
        }
      }

      const info = result[0] as any
      const versionParts = info.version?.split(" ") || []

      return {
        isConnected: this.isConnected,
        status: "connected",
        database: info.database || "unknown",
        user: info.user || "unknown",
        version: versionParts.length >= 2 ? `${versionParts[0]} ${versionParts[1]}` : (info.version || "unknown"),
        server: `${info.server_addr || "localhost"}:${info.server_port || 5432}`,
      }
    } catch (error) {
      this.logger.e("Error getting connection info:", error)
      return {
        isConnected: this.isConnected,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Выполнение здоровья БД
   */
  async healthCheck(): Promise<{ healthy: boolean, latency?: number, error?: string }> {
    if (!this.sql) {
      return { healthy: false, error: "Database not initialized" }
    }

    try {
      const start = Date.now()
      await this.sql`SELECT 1 as ping`
      const latency = Date.now() - start

      return { healthy: true, latency }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Получение статистики базы данных
   */
  async getStats(): Promise<object> {
    if (!this.sql) {
      return { available: false }
    }

    try {
      // Статистика активности
      const activity = await this.sql`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `

      // Размер базы данных
      const size = await this.sql`
        SELECT 
          pg_size_pretty(pg_database_size(current_database())) as database_size,
          pg_database_size(current_database()) as database_size_bytes
      `

      return {
        available: true,
        isConnected: this.isConnected,
        connections: activity[0],
        size: size[0],
        pool: {
          max: 20,
          available: this.sql.options.max,
        },
      }
    } catch (error) {
      this.logger.e("Error getting database stats:", error)
      return {
        available: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}
