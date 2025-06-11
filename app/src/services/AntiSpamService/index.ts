import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { IService } from "../../core/Container.js"
import { ANTI_SPAM_CONFIG } from "../../constants.js"

interface AntiSpamDependencies {
  // Пока нет зависимостей, но оставляем для расширяемости
}

interface AntiSpamResult {
  isSpam: boolean
  confidence?: number
  reason?: string
  error?: string
}

interface AntiSpamSettings {
  timeoutMs: number // Таймаут запроса (по умолчанию 5 секунд)
  maxRetries: number // Максимальное количество попыток (по умолчанию 2)
  retryDelayMs: number // Задержка между попытками (по умолчанию 1 секунда)
}

interface AntiSpamAPIResponse {
  is_spam: boolean
  confidence?: number
  reason?: string
}

/**
 * Сервис антиспама с обращением к внешнему API
 */
export class AntiSpamService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: AntiSpamDependencies
  private settings: AntiSpamSettings
  private isRunning = false

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: AntiSpamDependencies = {},
    settings?: Partial<AntiSpamSettings>,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Настройки по умолчанию
    this.settings = {
      timeoutMs: ANTI_SPAM_CONFIG.TIMEOUT_MS,
      maxRetries: ANTI_SPAM_CONFIG.MAX_RETRIES,
      retryDelayMs: ANTI_SPAM_CONFIG.RETRY_DELAY_MS,
      ...settings,
    }
  }

  /**
   * Инициализация сервиса антиспама
   */
  async initialize(): Promise<void> {
    this.logger.i("🛡️ Initializing anti-spam service...")

    if (!this.config.ANTISPAM_URL) {
      this.logger.w("⚠️ ANTISPAM_URL not configured, service will be disabled")
      return
    }

    this.logger.i("✅ Anti-spam service initialized")
  }

  /**
   * Запуск сервиса антиспама
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting anti-spam service...")
    this.isRunning = true

    // Проверяем доступность API
    await this.healthCheck()

    this.logger.i("✅ Anti-spam service started")
  }

  /**
   * Остановка сервиса антиспама
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping anti-spam service...")
    this.isRunning = false
    this.logger.i("✅ Anti-spam service stopped")
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing anti-spam service...")
    await this.stop()
    this.logger.i("✅ Anti-spam service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.isRunning && !!this.config.ANTISPAM_URL
  }

  /**
   * Проверка сообщения на спам через внешний API
   */
  async checkMessage(userId: number, message: string): Promise<AntiSpamResult> {
    if (!this.isRunning) {
      this.logger.w("❌ Anti-spam service is not running")
      return { isSpam: false, error: "Service not running" }
    }

    if (!this.config.ANTISPAM_URL) {
      this.logger.w("❌ ANTISPAM_URL not configured")
      return { isSpam: false, error: "API URL not configured" }
    }

    if (!message || message.trim().length === 0) {
      return { isSpam: false, reason: "Empty message" }
    }

    try {
      const result = await this.callAntiSpamAPI(message)

      if (result.isSpam) {
        this.logger.w(`🚨 Spam detected from user ${userId}: ${result.reason || "Unknown reason"}`)
      }

      return result
    } catch (error) {
      this.logger.e("❌ Error checking message for spam:", error)
      return {
        isSpam: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }

  /**
   * Вызов внешнего API антиспама с повторными попытками
   */
  private async callAntiSpamAPI(text: string): Promise<AntiSpamResult> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= this.settings.maxRetries; attempt++) {
      try {
        const response = await this.makeHttpRequest(text)

        if (response.ok) {
          const responseText = await response.text()

          try {
            const data = JSON.parse(responseText) as AntiSpamAPIResponse

            return {
              isSpam: Boolean(data.is_spam),
              confidence: data.confidence,
              reason: data.reason,
            }
          } catch (parseError) {
            this.logger.e(`❌ Failed to parse JSON response: ${parseError}`)
            throw new Error(`Invalid JSON response: ${parseError}`)
          }
        } else {
          const errorBody = await response.text()
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`)
        }
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Логируем только если это последняя попытка или критическая ошибка
        if (attempt === this.settings.maxRetries) {
          this.logger.e(`❌ Anti-spam API failed after ${this.settings.maxRetries} attempts: ${lastError.message}`)
        }

        // Если это не последняя попытка, ждем перед следующей
        if (attempt < this.settings.maxRetries) {
          await this.delay(this.settings.retryDelayMs)
        }
      }
    }

    throw lastError || new Error("All retry attempts failed")
  }

  /**
   * Выполнение HTTP запроса к антиспам API
   */
  private async makeHttpRequest(text: string): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.settings.timeoutMs)

    const requestBody = JSON.stringify({ text })

    try {
      const response = await fetch(this.config.ANTISPAM_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      })

      return response
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.logger.e(`❌ Request timeout (${this.settings.timeoutMs}ms)`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
    }
  }

  /**
   * Проверка доступности API (health check)
   */
  private async healthCheck(): Promise<void> {
    try {
      // Проверяем с простым тестовым сообщением
      await this.callAntiSpamAPI("test message")
      this.logger.i("✅ Anti-spam API is healthy")
    } catch (error) {
      this.logger.w("⚠️ Anti-spam API health check failed:", error)
      // Не прерываем запуск сервиса, просто логируем предупреждение
    }
  }

  /**
   * Задержка выполнения
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Получение текущих настроек
   */
  getSettings(): AntiSpamSettings {
    return { ...this.settings }
  }

  /**
   * Обновление настроек
   */
  updateSettings(newSettings: Partial<AntiSpamSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    this.logger.i("📝 Anti-spam settings updated")
  }

  /**
   * Получение статистики сервиса
   */
  getStats(): object {
    return {
      name: "AntiSpamService",
      isRunning: this.isRunning,
      isHealthy: this.isHealthy(),
      apiUrl: this.config.ANTISPAM_URL ? "configured" : "not configured",
      settings: this.settings,
    }
  }

  /**
   * Тестовая проверка работы антиспама (для отладки)
   */
  async testAntiSpam(): Promise<void> {
    this.logger.i("🧪 Running AntiSpam test...")

    try {
      await this.checkMessage(999999, "This is a test message for debugging")
      this.logger.i("🧪 Test completed")
    } catch (error) {
      this.logger.e("🧪 Test failed:", error)
    }
  }
}
