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
    private tokensPerRequest: number = 1
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
      AI_THROTTLE_CONFIG.CLEANUP_INTERVAL
    )
  }

  /**
   * Получить или создать bucket для чата
   */
  private getBucket(contextId: string): TokenBucket {
    if (!this.buckets.has(contextId)) {
      this.buckets.set(contextId, new TokenBucket(
        AI_THROTTLE_CONFIG.BUCKET_CAPACITY,
        AI_THROTTLE_CONFIG.REFILL_RATE,
        AI_THROTTLE_CONFIG.TOKENS_PER_REQUEST
      ))
    }
    return this.buckets.get(contextId)!
  }

  /**
   * Вычисление адаптивной задержки на основе длины ответа
   */
  private calculateAdaptiveDelay(responseLength: number): number {
    const { MIN_DELAY, MAX_DELAY, SHORT_RESPONSE_THRESHOLD, LONG_RESPONSE_THRESHOLD } = AI_THROTTLE_CONFIG

    if (responseLength <= SHORT_RESPONSE_THRESHOLD) {
      return MIN_DELAY
    }

    if (responseLength >= LONG_RESPONSE_THRESHOLD) {
      return MAX_DELAY
    }

    // Линейная интерполяция между MIN и MAX
    const ratio = (responseLength - SHORT_RESPONSE_THRESHOLD) / 
                  (LONG_RESPONSE_THRESHOLD - SHORT_RESPONSE_THRESHOLD)
    
    return MIN_DELAY + (MAX_DELAY - MIN_DELAY) * ratio
  }

  /**
   * Ожидание разрешения на запрос (перед отправкой)
   */
  async waitForRequestPermission(contextId: string): Promise<void> {
    const bucket = this.getBucket(contextId)
    
    // Сначала проверяем token bucket
    if (bucket.tryConsume()) {
      // Есть токены - можем делать запрос сразу
      this.logger.d(`Chat ${contextId}: Token available, proceeding immediately`)
      return
    }

    // Токенов нет - ждем по правилам token bucket
    this.logger.d(`Chat ${contextId}: No tokens, waiting for refill`)
    await bucket.waitForToken()
  }

  /**
   * Применение адаптивной задержки после получения ответа
   */
  async applyPostResponseDelay(contextId: string, responseLength: number): Promise<void> {
    const adaptiveDelay = this.calculateAdaptiveDelay(responseLength)
    const lastRequestTime = this.lastRequestTime.get(contextId) || 0
    const timeSinceLastRequest = Date.now() - lastRequestTime

    // Если прошло меньше времени чем нужная задержка - дождемся
    if (timeSinceLastRequest < adaptiveDelay) {
      const remainingDelay = adaptiveDelay - timeSinceLastRequest
      this.logger.d(`Chat ${contextId}: Adaptive delay ${remainingDelay}ms (response: ${responseLength} chars)`)
      await new Promise(resolve => setTimeout(resolve, remainingDelay))
    }

    this.lastRequestTime.set(contextId, Date.now())
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
      lastRequestTime: this.lastRequestTime.get(contextId) || 0
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