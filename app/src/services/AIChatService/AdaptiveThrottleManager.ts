import type { Logger } from "../../helpers/Logger.js"
import { AI_THROTTLE_CONFIG } from "../../constants.js"

/**
 * Token Bucket для ограничения скорости запросов с поддержкой burst
 */
class TokenBucket {
  private tokens: number
  private lastRefillTime: number
  private lastActivityTime: number

  constructor(
    private capacity: number,
    private refillRate: number,
    private tokensPerRequest: number = 1,
  ) {
    this.tokens = capacity
    this.lastRefillTime = Date.now()
    this.lastActivityTime = Date.now()
  }

  /**
   * Пополнение токенов на основе прошедшего времени
   */
  private refill(): void {
    const now = Date.now()
    const timePassed = (now - this.lastRefillTime) / 1000 // в секундах

    if (timePassed > 0) {
      const tokensToAdd = Math.floor(timePassed * this.refillRate)
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd)
      this.lastRefillTime = now
    }
  }

  /**
   * Попытка потратить токены
   */
  tryConsume(): boolean {
    this.refill()
    this.lastActivityTime = Date.now()

    if (this.tokens >= this.tokensPerRequest) {
      this.tokens -= this.tokensPerRequest
      return true
    }

    return false
  }

  /**
   * Ожидание доступности токенов
   */
  async waitForToken(): Promise<void> {
    this.refill()
    this.lastActivityTime = Date.now()

    if (this.tokens >= this.tokensPerRequest) {
      this.tokens -= this.tokensPerRequest
      return
    }

    // Вычисляем время ожидания
    const tokensNeeded = this.tokensPerRequest - this.tokens
    const waitTimeMs = (tokensNeeded / this.refillRate) * 1000

    await new Promise(resolve => setTimeout(resolve, waitTimeMs))

    // После ожидания пробуем еще раз
    return this.waitForToken()
  }

  /**
   * Получить время последней активности
   */
  getLastActivity(): number {
    return this.lastActivityTime
  }

  /**
   * Получить текущее состояние bucket
   */
  getState(): { tokens: number, capacity: number } {
    this.refill()
    return { tokens: this.tokens, capacity: this.capacity }
  }
}

/**
 * Адаптивный менеджер throttling для чатов
 * Комбинирует Token Bucket с адаптивными задержками на основе длины ответов
 */
export class AdaptiveChatThrottleManager {
  private buckets: Map<string, TokenBucket> = new Map()
  private lastRequestTime: Map<string, number> = new Map()
  private cleanupInterval: NodeJS.Timeout
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
    this.cleanupInterval = setInterval(
      () => this.cleanup(),
      AI_THROTTLE_CONFIG.CLEANUP_INTERVAL,
    )
  }

  /**
   * Получить или создать bucket для чата
   */
  private getBucket(contextId: string): TokenBucket {
    if (!this.buckets.has(contextId)) {
      this.buckets.set(contextId, new TokenBucket(
        AI_THROTTLE_CONFIG.BUCKET_CAPACITY,
        AI_THROTTLE_CONFIG.MAX_DELAY,
        AI_THROTTLE_CONFIG.TOKENS_PER_REQUEST,
      ))
    }
    return this.buckets.get(contextId)!
  }

  /**
   * Основной throttling: сначала token bucket, потом задержка по длине ответа
   */
  async waitForThrottle(contextId: string, responseLength: number): Promise<void> {
    const bucket = this.getBucket(contextId)
    // Сначала token bucket
    if (!bucket.tryConsume()) {
      await bucket.waitForToken()
    }
    // Затем задержка по длине ответа
    const delay = this.calculateAdaptiveDelay(responseLength)
    if (delay > 0) {
      this.logger.d(`Chat ${contextId}: Adaptive delay ${delay}ms (response: ${responseLength} chars)`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    this.lastRequestTime.set(contextId, Date.now())
  }

  /**
   * Линейная задержка: короткие ответы — 0, длинные — MAX_DELAY
   */
  private calculateAdaptiveDelay(responseLength: number): number {
    const { MAX_DELAY, SHORT_RESPONSE_THRESHOLD, LONG_RESPONSE_THRESHOLD } = AI_THROTTLE_CONFIG
    if (responseLength <= SHORT_RESPONSE_THRESHOLD) {
      return 0
    }

    if (responseLength >= LONG_RESPONSE_THRESHOLD) {
      return MAX_DELAY
    }

    const ratio = (responseLength - SHORT_RESPONSE_THRESHOLD) / (LONG_RESPONSE_THRESHOLD - SHORT_RESPONSE_THRESHOLD)
    return Math.round(MAX_DELAY * ratio)
  }

  /**
   * Получить статистику для чата
   */
  getChatStats(contextId: string): {
    bucketState: { tokens: number, capacity: number }
    lastRequestTime: number
  } {
    const bucket = this.getBucket(contextId)
    return {
      bucketState: bucket.getState(),
      lastRequestTime: this.lastRequestTime.get(contextId) || 0,
    }
  }

  /**
   * Очистка неактивных чатов
   */
  private cleanup(): void {
    const now = Date.now()
    const inactiveThreshold = AI_THROTTLE_CONFIG.INACTIVE_TIMEOUT

    for (const [contextId, bucket] of this.buckets.entries()) {
      if (now - bucket.getLastActivity() > inactiveThreshold) {
        this.buckets.delete(contextId)
        this.lastRequestTime.delete(contextId)
        this.logger.d(`Cleaned up inactive chat throttle: ${contextId}`)
      }
    }
  }

  /**
   * Освобождение ресурсов
   */
  dispose(): void {
    clearInterval(this.cleanupInterval)
    this.buckets.clear()
    this.lastRequestTime.clear()
  }
}
