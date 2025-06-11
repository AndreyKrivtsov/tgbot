import type { Logger } from "../../../helpers/Logger.js"
import type { RedisService } from "../../RedisService/index.js"
import type {
  UserCounterData,
  UserMessageCounter,
  UserMetaData,
  UserSpamData,
} from "../types/index.js"

/**
 * Менеджер пользователей для управления состоянием и информацией о пользователях
 * Использует Redis для персистентного хранения данных
 */
export class UserManager {
  private logger: Logger
  private redisService: RedisService
  private cleanupIntervalMs: number
  private cleanupTimer?: NodeJS.Timeout

  // Константы для TTL (в секундах)
  private static readonly COUNTER_TTL = 48 * 60 * 60 // 48 часов
  private static readonly META_TTL = 7 * 24 * 60 * 60 // 7 дней
  private static readonly SPAM_TTL = 24 * 60 * 60 // 24 часа

  constructor(
    logger: Logger,
    redisService: RedisService,
    cleanupIntervalMs: number = 30 * 60 * 1000, // 30 минут
  ) {
    this.logger = logger
    this.redisService = redisService
    this.cleanupIntervalMs = cleanupIntervalMs
  }

  /**
   * Получение ключей Redis для пользователя
   */
  private getRedisKeys(userId: number) {
    return {
      counter: `counter:user:${userId}`,
      meta: `meta:user:${userId}`,
      spam: `spam:user:${userId}`,
    }
  }

  /**
   * Получение или создание счетчика сообщений пользователя
   */
  async getUserOrCreate(userId: number, username?: string, firstName?: string): Promise<UserMessageCounter> {
    const keys = this.getRedisKeys(userId)

    try {
      // Получаем данные из Redis
      const [counterData, metaData] = await Promise.all([
        this.redisService.get<UserCounterData>(keys.counter),
        this.redisService.get<UserMetaData>(keys.meta),
      ])

      const now = Date.now()

      if (!counterData) {
        // Создаем новый счетчик
        const newCounterData: UserCounterData = {
          messageCount: 0,
          spamCount: 0,
          lastActivity: now,
          createdAt: now,
        }

        const newMetaData: UserMetaData = {
          username,
          firstName: firstName || "Unknown",
          updatedAt: now,
        }

        // Сохраняем в Redis с TTL
        await Promise.all([
          this.redisService.set(keys.counter, newCounterData, UserManager.COUNTER_TTL),
          this.redisService.set(keys.meta, newMetaData, UserManager.META_TTL),
        ])

        this.logger.i(`Created new counter for user ${userId} (${firstName})`)

        return {
          userId,
          messageCount: 0,
          spamCount: 0,
          username,
          firstName: firstName || "Unknown",
          lastActivity: now,
        }
      } else {
        // Обновляем существующий счетчик
        counterData.lastActivity = now

        // Обновляем мета-данные если изменились
        const updatedMetaData: UserMetaData = {
          username: username || metaData?.username,
          firstName: firstName || metaData?.firstName || "Unknown",
          updatedAt: now,
        }

        // Сохраняем обновления
        await Promise.all([
          this.redisService.set(keys.counter, counterData, UserManager.COUNTER_TTL),
          this.redisService.set(keys.meta, updatedMetaData, UserManager.META_TTL),
        ])

        return {
          userId,
          messageCount: counterData.messageCount,
          spamCount: counterData.spamCount,
          username: updatedMetaData.username,
          firstName: updatedMetaData.firstName,
          lastActivity: counterData.lastActivity,
        }
      }
    } catch (error) {
      this.logger.e(`Error getting user ${userId}:`, error)

      // Возвращаем базовый объект в случае ошибки
      return {
        userId,
        messageCount: 0,
        spamCount: 0,
        username,
        firstName: firstName || "Unknown",
        lastActivity: Date.now(),
      }
    }
  }

  /**
   * Получение информации о пользователе из Telegram контекста (устаревший метод)
   */
  getUserFromContext(fromUser: any): any {
    if (!fromUser?.id) {
      return null
    }

    // В упрощенной архитектуре просто возвращаем информацию о пользователе
    return {
      id: fromUser.id,
      username: fromUser.username,
      firstname: fromUser.first_name,
      messages: 0,
      sessionId: `session_${fromUser.id}_${Date.now()}`,
    }
  }

  /**
   * Обновление счетчика сообщений пользователя
   */
  async updateMessageCounter(userId: number, username?: string, firstName?: string): Promise<UserMessageCounter> {
    const keys = this.getRedisKeys(userId)

    try {
      // Получаем данные из Redis
      const [counterData, metaData] = await Promise.all([
        this.redisService.get<UserCounterData>(keys.counter),
        this.redisService.get<UserMetaData>(keys.meta),
      ])

      const now = Date.now()

      if (!counterData) {
        // Создаем новый счетчик
        const newCounterData: UserCounterData = {
          messageCount: 1,
          spamCount: 0,
          lastActivity: now,
          createdAt: now,
        }

        const newMetaData: UserMetaData = {
          username,
          firstName: firstName || "Unknown",
          updatedAt: now,
        }

        // Сохраняем в Redis с TTL
        await Promise.all([
          this.redisService.set(keys.counter, newCounterData, UserManager.COUNTER_TTL),
          this.redisService.set(keys.meta, newMetaData, UserManager.META_TTL),
        ])

        this.logger.i(`Created new counter for user ${userId} (${firstName})`)

        return {
          userId,
          messageCount: 1,
          spamCount: 0,
          username,
          firstName: firstName || "Unknown",
          lastActivity: now,
        }
      } else {
        // Обновляем существующий счетчик
        counterData.messageCount++
        counterData.lastActivity = now

        // Обновляем мета-данные если изменились
        const updatedMetaData: UserMetaData = {
          username: username || metaData?.username,
          firstName: firstName || metaData?.firstName || "Unknown",
          updatedAt: now,
        }

        // Сохраняем обновления
        await Promise.all([
          this.redisService.set(keys.counter, counterData, UserManager.COUNTER_TTL),
          this.redisService.set(keys.meta, updatedMetaData, UserManager.META_TTL),
        ])

        return {
          userId,
          messageCount: counterData.messageCount,
          spamCount: counterData.spamCount,
          username: updatedMetaData.username,
          firstName: updatedMetaData.firstName,
          lastActivity: counterData.lastActivity,
        }
      }
    } catch (error) {
      this.logger.e(`Error updating message counter for user ${userId}:`, error)

      // Возвращаем базовый объект в случае ошибки
      return {
        userId,
        messageCount: 1,
        spamCount: 0,
        username,
        firstName: firstName || "Unknown",
        lastActivity: Date.now(),
      }
    }
  }

  /**
   * Получение счетчика пользователя
   */
  async getUserCounter(userId: number): Promise<UserMessageCounter | undefined> {
    const keys = this.getRedisKeys(userId)

    try {
      // Получаем данные из Redis
      const [counterData, metaData] = await Promise.all([
        this.redisService.get<UserCounterData>(keys.counter),
        this.redisService.get<UserMetaData>(keys.meta),
      ])

      if (!counterData) {
        return undefined
      }

      return {
        userId,
        messageCount: counterData.messageCount,
        spamCount: counterData.spamCount,
        username: metaData?.username,
        firstName: metaData?.firstName || "Unknown",
        lastActivity: counterData.lastActivity,
      }
    } catch (error) {
      this.logger.e(`Error getting user counter ${userId}:`, error)
      return undefined
    }
  }

  /**
   * Получение всех счетчиков пользователей (для обратной совместимости)
   * ВНИМАНИЕ: Этот метод может быть медленным в Redis!
   */
  async getAllUserCounters(): Promise<UserMessageCounter[]> {
    this.logger.w("getAllUserCounters() - expensive operation in Redis version!")

    try {
      // Это неэффективно для больших объемов данных
      // В продакшене лучше избегать этого метода
      const keys = await this.redisService.keys("counter:user:*")
      const counters: UserMessageCounter[] = []

      for (const key of keys) {
        const userIdMatch = key.match(/counter:user:(\d+)/)
        if (userIdMatch) {
          const userId = Number.parseInt(userIdMatch[1])
          const userCounter = await this.getUserCounter(userId)
          if (userCounter) {
            counters.push(userCounter)
          }
        }
      }

      return counters
    } catch (error) {
      this.logger.e("Error getting all user counters:", error)
      return []
    }
  }

  /**
   * Очистка счетчика для конкретного пользователя
   */
  async clearUserCounter(userId: number): Promise<boolean> {
    const keys = this.getRedisKeys(userId)

    try {
      const results = await Promise.all([
        this.redisService.del(keys.counter),
        this.redisService.del(keys.meta),
        this.redisService.del(keys.spam),
      ])

      const cleared = results.some(result => result)
      if (cleared) {
        this.logger.i(`Cleared counter for user ${userId}`)
      }
      return cleared
    } catch (error) {
      this.logger.e(`Error clearing user counter ${userId}:`, error)
      return false
    }
  }

  /**
   * Очистка старых счетчиков пользователей
   * В Redis версии полагаемся на TTL для автоматической очистки
   */
  async cleanupOldCounters(_maxAgeHours: number = 24): Promise<number> {
    this.logger.i(`Redis TTL handles cleanup automatically (configured TTL: ${UserManager.COUNTER_TTL}s)`)

    // В Redis версии очистка происходит автоматически через TTL
    // Этот метод оставлен для обратной совместимости
    return 0
  }

  /**
   * Запуск автоматической очистки старых счетчиков
   * В Redis версии полагаемся на TTL
   */
  startCleanupTimer(): void {
    this.logger.i("Redis version uses TTL for automatic cleanup, timer not needed")

    // Можем запустить периодическую проверку здоровья Redis
    this.cleanupTimer = setInterval(async () => {
      const isHealthy = await this.redisService.healthCheck()
      if (!isHealthy.healthy) {
        this.logger.w("Redis health check failed:", isHealthy.error)
      }
    }, this.cleanupIntervalMs)

    this.logger.i(`Started Redis health check timer (interval: ${this.cleanupIntervalMs}ms)`)
  }

  /**
   * Остановка автоматической очистки
   */
  stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = undefined
      this.logger.i("Stopped Redis health check timer")
    }
  }

  /**
   * Увеличение счетчика спама пользователя
   */
  async incrementSpamCounter(userId: number): Promise<UserMessageCounter | null> {
    const keys = this.getRedisKeys(userId)

    try {
      // Получаем данные из Redis
      const [counterData, metaData, spamData] = await Promise.all([
        this.redisService.get<UserCounterData>(keys.counter),
        this.redisService.get<UserMetaData>(keys.meta),
        this.redisService.get<UserSpamData>(keys.spam),
      ])

      if (!counterData) {
        this.logger.w(`Cannot increment spam counter: user ${userId} not found`)
        return null
      }

      const now = Date.now()

      // Обновляем счетчики
      counterData.spamCount++
      counterData.lastActivity = now

      const updatedSpamData: UserSpamData = {
        totalSpam: (spamData?.totalSpam || 0) + 1,
        lastSpamAt: now,
        lastReason: "spam detected",
      }

      // Сохраняем обновления
      await Promise.all([
        this.redisService.set(keys.counter, counterData, UserManager.COUNTER_TTL),
        this.redisService.set(keys.spam, updatedSpamData, UserManager.SPAM_TTL),
      ])

      this.logger.w(`Spam counter incremented for user ${userId} (${metaData?.firstName}): ${counterData.spamCount}`)

      return {
        userId,
        messageCount: counterData.messageCount,
        spamCount: counterData.spamCount,
        username: metaData?.username,
        firstName: metaData?.firstName || "Unknown",
        lastActivity: counterData.lastActivity,
      }
    } catch (error) {
      this.logger.e(`Error incrementing spam counter for user ${userId}:`, error)
      return null
    }
  }

  /**
   * Сброс счетчика спама для пользователя
   */
  async resetSpamCounter(userId: number): Promise<boolean> {
    const keys = this.getRedisKeys(userId)

    try {
      const [counterData, metaData] = await Promise.all([
        this.redisService.get<UserCounterData>(keys.counter),
        this.redisService.get<UserMetaData>(keys.meta),
      ])

      if (!counterData) {
        return false
      }

      const now = Date.now()
      counterData.spamCount = 0
      counterData.lastActivity = now

      // Удаляем данные о спаме и обновляем счетчик
      await Promise.all([
        this.redisService.set(keys.counter, counterData, UserManager.COUNTER_TTL),
        this.redisService.del(keys.spam),
      ])

      this.logger.i(`Reset spam counter for user ${userId} (${metaData?.firstName})`)
      return true
    } catch (error) {
      this.logger.e(`Error resetting spam counter for user ${userId}:`, error)
      return false
    }
  }

  /**
   * Получение статистики спама
   * ВНИМАНИЕ: Может быть медленным для больших объемов данных!
   */
  async getSpamStats(): Promise<{ totalUsers: number, spamUsers: number, totalMessages: number, totalSpam: number }> {
    this.logger.w("getSpamStats() - expensive operation in Redis version!")

    try {
      const counters = await this.getAllUserCounters()

      return {
        totalUsers: counters.length,
        spamUsers: counters.filter(c => c.spamCount > 0).length,
        totalMessages: counters.reduce((sum, c) => sum + c.messageCount, 0),
        totalSpam: counters.reduce((sum, c) => sum + c.spamCount, 0),
      }
    } catch (error) {
      this.logger.e("Error getting spam stats:", error)
      return {
        totalUsers: 0,
        spamUsers: 0,
        totalMessages: 0,
        totalSpam: 0,
      }
    }
  }

  /**
   * Проверка существования счетчика для пользователя
   */
  async hasMessageCounter(userId: number): Promise<boolean> {
    const keys = this.getRedisKeys(userId)

    try {
      const counterData = await this.redisService.get<UserCounterData>(keys.counter)
      return counterData !== null
    } catch (error) {
      this.logger.e(`Error checking if user ${userId} has counter:`, error)
      return false
    }
  }

  /**
   * Удаление счетчика для пользователя (алиас для clearUserCounter)
   */
  async deleteMessageCounter(userId: number): Promise<boolean> {
    return await this.clearUserCounter(userId)
  }

  /**
   * Получение всех счетчиков как Map (для обратной совместимости)
   * ВНИМАНИЕ: Очень медленный метод в Redis версии!
   */
  async getMessageCounters(): Promise<Map<number, UserMessageCounter>> {
    this.logger.w("getMessageCounters() - very expensive operation in Redis version!")

    try {
      const counters = await this.getAllUserCounters()
      const map = new Map<number, UserMessageCounter>()

      for (const counter of counters) {
        map.set(counter.userId, counter)
      }

      return map
    } catch (error) {
      this.logger.e("Error getting message counters map:", error)
      return new Map()
    }
  }

  /**
   * Освобождение ресурсов
   */
  dispose(): void {
    this.stopCleanupTimer()
    this.logger.i("UserManager disposed")
  }
}
