import type { IService } from "../core/Container.js"
import type { Logger } from "../helpers/Logger.js"
import type { AppConfig } from "../config.js"
import { createClient, type RedisClientType } from "redis"

/**
 * Сервис Redis для высокопроизводительного кэширования
 */
export class RedisService implements IService {
  private config: AppConfig
  private logger: Logger
  private client: RedisClientType | null = null
  private isConnected = false

  constructor(config: AppConfig, logger: Logger) {
    this.config = config
    this.logger = logger
  }

  /**
   * Инициализация Redis сервиса
   */
  async initialize(): Promise<void> {
    this.logger.i("🔄 Initializing Redis service...")

    try {
      // Проверяем наличие REDIS_URL
      if (!this.config.REDIS_URL) {
        this.logger.w("⚠️ REDIS_URL not configured - Redis service disabled")
        this.logger.w("📋 Redis is optional but recommended for better performance")
        return
      }

      // Создаем клиент Redis
      this.client = createClient({
        url: this.config.REDIS_URL,
        socket: {
          connectTimeout: 10000,  // 10 секунд таймаут подключения
          reconnectStrategy: (retries) => {
            if (retries > 3) {
              this.logger.e("Redis: Maximum reconnection attempts reached")
              return false
            }
            return Math.min(retries * 1000, 5000) // Экспоненциальная задержка до 5 сек
          }
        },
        database: 0, // База по умолчанию
      })

      // Обработчики событий
      this.client.on('error', (error) => {
        this.logger.e("Redis error:", error)
        this.isConnected = false
      })

      this.client.on('connect', () => {
        this.logger.d("Redis client connected")
      })

      this.client.on('ready', () => {
        this.logger.d("Redis client ready")
        this.isConnected = true
      })

      this.client.on('end', () => {
        this.logger.d("Redis client disconnected")
        this.isConnected = false
      })

      this.client.on('reconnecting', () => {
        this.logger.d("Redis client reconnecting...")
      })

      this.logger.i("✅ Redis service initialized")
    } catch (error) {
      this.logger.e("❌ Failed to initialize Redis service:", error)
      // Не прерываем выполнение приложения
    }
  }

  /**
   * Запуск Redis сервиса
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting Redis service...")

    if (!this.client) {
      this.logger.w("🚫 Redis not configured, skipping connection")
      return
    }

    try {
      await this.client.connect()
      this.isConnected = true

      // Тестируем подключение
      await this.client.ping()
      
      this.logger.i("✅ Redis service started successfully")

      // Логируем информацию о подключении
      const info = await this.getConnectionInfo()
      this.logger.i(`📊 Redis info: ${JSON.stringify(info)}`)

    } catch (error) {
      this.logger.e("❌ Failed to start Redis service:", error)
      this.isConnected = false
      // Не прерываем выполнение приложения
    }
  }

  /**
   * Остановка Redis сервиса
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping Redis service...")

    try {
      if (this.client && this.isConnected) {
        await this.client.quit()
      }
      this.client = null
      this.isConnected = false

      this.logger.i("✅ Redis service stopped")
    } catch (error) {
      this.logger.e("Error stopping Redis service:", error)
    }
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing Redis service...")
    await this.stop()
    this.logger.i("✅ Redis service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.isConnected && this.client !== null
  }

  /**
   * Получение информации о подключении
   */
  async getConnectionInfo(): Promise<object> {
    if (!this.client || !this.isConnected) {
      return { 
        isConnected: false, 
        status: this.client ? "disconnected" : "not_configured" 
      }
    }

    try {
      const info = await this.client.info()
      const lines = info.split('\r\n')
      const parsed: Record<string, string> = {}
      
      for (const line of lines) {
        if (line.includes(':')) {
          const [key, value] = line.split(':')
          if (key && value !== undefined) {
            parsed[key] = value
          }
        }
      }

      return {
        isConnected: this.isConnected,
        status: "connected",
        version: parsed.redis_version,
        mode: parsed.redis_mode || "standalone",
        connectedClients: parsed.connected_clients,
        usedMemory: parsed.used_memory_human,
        totalConnectionsReceived: parsed.total_connections_received,
        totalCommandsProcessed: parsed.total_commands_processed
      }
    } catch (error) {
      this.logger.e("Error getting Redis connection info:", error)
      return {
        isConnected: this.isConnected,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }

  /**
   * Проверка здоровья Redis
   */
  async healthCheck(): Promise<{ healthy: boolean; latency?: number; error?: string }> {
    if (!this.client || !this.isConnected) {
      return { healthy: false, error: "Redis not available" }
    }

    try {
      const start = Date.now()
      await this.client.ping()
      const latency = Date.now() - start

      return { healthy: true, latency }
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }

  // ====== ОСНОВНЫЕ ОПЕРАЦИИ КЭШИРОВАНИЯ ======

  /**
   * Установка значения с TTL
   */
  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const serialized = JSON.stringify(value)
      
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, serialized)
      } else {
        await this.client.set(key, serialized)
      }
      
      return true
    } catch (error) {
      this.logger.e(`Redis SET error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Получение значения
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (!this.client || !this.isConnected) return null

    try {
      const value = await this.client.get(key)
      return value ? JSON.parse(value) : null
    } catch (error) {
      this.logger.e(`Redis GET error for key ${key}:`, error)
      return null
    }
  }

  /**
   * Удаление ключа
   */
  async del(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const result = await this.client.del(key)
      return result > 0
    } catch (error) {
      this.logger.e(`Redis DEL error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Проверка существования ключа
   */
  async exists(key: string): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const result = await this.client.exists(key)
      return result > 0
    } catch (error) {
      this.logger.e(`Redis EXISTS error for key ${key}:`, error)
      return false
    }
  }

  /**
   * Увеличение счетчика
   */
  async incr(key: string, ttlSeconds?: number): Promise<number> {
    if (!this.client || !this.isConnected) return 0

    try {
      const result = await this.client.incr(key)
      
      // Устанавливаем TTL только при первом создании ключа
      if (result === 1 && ttlSeconds) {
        await this.client.expire(key, ttlSeconds)
      }
      
      return result
    } catch (error) {
      this.logger.e(`Redis INCR error for key ${key}:`, error)
      return 0
    }
  }

  /**
   * Установка TTL для существующего ключа
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    if (!this.client || !this.isConnected) return false

    try {
      const result = await this.client.expire(key, ttlSeconds)
      return result > 0
    } catch (error) {
      this.logger.e(`Redis EXPIRE error for key ${key}:`, error)
      return false
    }
  }

  // ====== СПЕЦИАЛИЗИРОВАННЫЕ МЕТОДЫ ДЛЯ БОТА ======

  /**
   * Кэширование данных пользователя
   */
  async cacheUser(userId: number, userData: any, ttlMinutes: number = 60): Promise<void> {
    await this.set(`user:${userId}`, userData, ttlMinutes * 60)
  }

  /**
   * Получение кэшированных данных пользователя
   */
  async getCachedUser(userId: number): Promise<any> {
    return await this.get(`user:${userId}`)
  }

  /**
   * Управление ограниченными пользователями (капча)
   */
  async setRestrictedUser(userId: number, data: any): Promise<void> {
    await this.set(`captcha:user:${userId}`, data, 300) // 5 минут
  }

  async getRestrictedUser(userId: number): Promise<any> {
    return await this.get(`captcha:user:${userId}`)
  }

  async removeRestrictedUser(userId: number): Promise<void> {
    await this.del(`captcha:user:${userId}`)
  }

  /**
   * Антиспам проверки
   */
  async setSpamCheck(userId: number, data: any): Promise<void> {
    await this.set(`antispam:user:${userId}`, data, 86400) // 24 часа
  }

  async getSpamCheck(userId: number): Promise<any> {
    return await this.get(`antispam:user:${userId}`)
  }

  /**
   * AI лимиты
   */
  async incrementAILimit(chatId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0]
    const key = `ai:limit:${chatId}:${today}`
    
    const count = await this.incr(key)
    
    // Устанавливаем TTL до конца дня
    if (count === 1) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(0, 0, 0, 0)
      const ttl = Math.floor((tomorrow.getTime() - Date.now()) / 1000)
      await this.expire(key, ttl)
    }
    
    return count
  }

  async getAILimit(chatId: number): Promise<number> {
    const today = new Date().toISOString().split('T')[0]
    const count = await this.get<number>(`ai:limit:${chatId}:${today}`)
    return count || 0
  }

  /**
   * Получение статистики Redis
   */
  async getStats(): Promise<object> {
    if (!this.client || !this.isConnected) {
      return { available: false }
    }

    try {
      const info = await this.client.info()
      const memory = await this.client.info('memory')
      const stats = await this.client.info('stats')
      
      return {
        available: true,
        isConnected: this.isConnected,
        info: this.parseRedisInfo(info),
        memory: this.parseRedisInfo(memory),
        stats: this.parseRedisInfo(stats)
      }
    } catch (error) {
      this.logger.e("Error getting Redis stats:", error)
      return {
        available: false,
        error: error instanceof Error ? error.message : "Unknown error"
      }
    }
  }

  /**
   * Парсинг INFO ответа Redis
   */
  private parseRedisInfo(info: string): Record<string, string> {
    const result: Record<string, string> = {}
    const lines = info.split('\r\n')
    
    for (const line of lines) {
      if (line.includes(':')) {
        const [key, value] = line.split(':')
        if (key && value !== undefined) {
          result[key] = value
        }
      }
    }
    
    return result
  }
} 