import type { Logger } from "../../helpers/Logger.js"
import type { RedisService } from "../RedisService/index.js"

interface UserCounterData {
  messageCount: number
  spamCount: number
  lastActivity: number
  createdAt: number
}

interface UserSpamData {
  totalSpam: number
  lastSpamAt: number
  lastReason?: string
}

export interface UserMessageCounter {
  userId: number
  messageCount: number
  spamCount: number
  lastActivity: number
}

/**
 * Счетчики пользователей для антиспам-сервиса
 * Использует Redis для хранения счетчиков сообщений и спама
 */
export class UserCounters {
  private logger: Logger
  private redisService: RedisService

  // Константы для TTL (в секундах)
  private static readonly COUNTER_TTL = 48 * 60 * 60 // 48 часов
  private static readonly SPAM_TTL = 24 * 60 * 60 // 24 часа

  constructor(logger: Logger, redisService: RedisService) {
    this.logger = logger
    this.redisService = redisService
  }

  /**
   * Получение ключей Redis для пользователя
   */
  private getRedisKeys(userId: number) {
    return {
      counter: `as:counter:user:${userId}`,
      spam: `as:spam:user:${userId}`,
    }
  }

  /**
   * Увеличение счетчика сообщений пользователя
   */
  async incrementMessageCount(userId: number): Promise<UserMessageCounter> {
    const keys = this.getRedisKeys(userId)

    try {
      const counterData = await this.redisService.get<UserCounterData>(keys.counter)
      const now = Date.now()

      if (!counterData) {
        const newCounterData: UserCounterData = {
          messageCount: 1,
          spamCount: 0,
          lastActivity: now,
          createdAt: now,
        }

        await this.redisService.set(keys.counter, newCounterData, UserCounters.COUNTER_TTL)

        return {
          userId,
          messageCount: 1,
          spamCount: 0,
          lastActivity: now,
        }
      } else {
        counterData.messageCount++
        counterData.lastActivity = now

        await this.redisService.set(keys.counter, counterData, UserCounters.COUNTER_TTL)

        return {
          userId,
          messageCount: counterData.messageCount,
          spamCount: counterData.spamCount,
          lastActivity: counterData.lastActivity,
        }
      }
    } catch (error) {
      this.logger.e(`Error incrementing message counter for user ${userId}:`, error)

      return {
        userId,
        messageCount: 1,
        spamCount: 0,
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
      const counterData = await this.redisService.get<UserCounterData>(keys.counter)

      if (!counterData) {
        return undefined
      }

      return {
        userId,
        messageCount: counterData.messageCount,
        spamCount: counterData.spamCount,
        lastActivity: counterData.lastActivity,
      }
    } catch (error) {
      this.logger.e(`Error getting user counter ${userId}:`, error)
      return undefined
    }
  }

  /**
   * Увеличение счетчика спама пользователя
   */
  async incrementSpamCounter(userId: number): Promise<UserMessageCounter | null> {
    const keys = this.getRedisKeys(userId)

    try {
      const [counterData, spamData] = await Promise.all([
        this.redisService.get<UserCounterData>(keys.counter),
        this.redisService.get<UserSpamData>(keys.spam),
      ])

      if (!counterData) {
        this.logger.w(`Cannot increment spam counter: user ${userId} not found`)
        return null
      }

      const now = Date.now()

      counterData.spamCount++
      counterData.lastActivity = now

      const updatedSpamData: UserSpamData = {
        totalSpam: (spamData?.totalSpam || 0) + 1,
        lastSpamAt: now,
        lastReason: "spam detected",
      }

      await Promise.all([
        this.redisService.set(keys.counter, counterData, UserCounters.COUNTER_TTL),
        this.redisService.set(keys.spam, updatedSpamData, UserCounters.SPAM_TTL),
      ])

      this.logger.w(`Spam counter incremented for user ${userId}: ${counterData.spamCount}`)

      return {
        userId,
        messageCount: counterData.messageCount,
        spamCount: counterData.spamCount,
        lastActivity: counterData.lastActivity,
      }
    } catch (error) {
      this.logger.e(`Error incrementing spam counter for user ${userId}:`, error)
      return null
    }
  }

  /**
   * Очистка счетчика для конкретного пользователя
   */
  async clearUserCounter(userId: number): Promise<boolean> {
    const keys = this.getRedisKeys(userId)

    try {
      const results: boolean[] = await Promise.all([
        this.redisService.del(keys.counter),
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
}

