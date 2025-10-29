import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { IService } from "../../core/Container.js"
import type { EventBus, MessageReceivedEvent } from "../../core/EventBus.js"
import { EVENTS } from "../../core/EventBus.js"

import { ANTI_SPAM_CONFIG } from "../../constants.js"

interface AntiSpamDependencies {
  eventBus?: EventBus
  userManager?: any // Для получения счетчиков пользователей
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
  private eventBus?: EventBus
  private userManager?: any

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

    this.eventBus = dependencies.eventBus
    this.userManager = dependencies.userManager
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

    // Подписываемся на события сообщений если доступен EventBus
    if (this.eventBus) {
      this.setupEventListeners()
    }

    this.logger.i("✅ Anti-spam service started")
  }

  /**
   * Настройка слушателей событий
   */
  private setupEventListeners(): void {
    if (!this.eventBus)
      return

    // Слушаем все входящие сообщения
    this.eventBus.on(EVENTS.MESSAGE_RECEIVED, async (event: MessageReceivedEvent) => {
      try {
        // Проверяем только первые 5 сообщений пользователя
        if (this.userManager) {
          const userCounter = await this.userManager.getUserCounter(event.from.id)
          if (userCounter && userCounter.messageCount > 5) {
            return // Пропускаем проверку для опытных пользователей
          }
        }

        // Проверяем сообщение на спам
        const spamResult = await this.checkMessage(event.from.id, event.text)

        if (spamResult.isSpam) {
          // Получаем текущий счетчик спама
          let spamCount = 0
          if (this.userManager) {
            const userCounter = await this.userManager.getUserCounter(event.from.id)
            spamCount = userCounter?.spamCount || 0
            // Увеличиваем счетчик
            await this.userManager.incrementSpamCounter(event.from.id)
          }

          // Определяем действия в зависимости от счетчика спама
          const actions: any[] = [
            {
              type: "deleteMessage",
              params: { messageId: event.id },
            },
          ]

          if (spamCount < 2) {
            // Предупреждение
            const modifier = spamCount > 0 ? "Повторное c" : ""
            const escapedName = event.from.firstName.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&")
            actions.push({
              type: "sendMessage",
              params: {
                text: `⚠️ ${modifier}Предупреждение для ${escapedName}: обнаружен спам`,
                parseMode: "MarkdownV2",
                autoDelete: 20000,
              },
            })
          } else {
            // Кик пользователя
            const escapedName = event.from.firstName.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&")
            actions.push(
              {
                type: "sendMessage",
                params: {
                  text: `🚫 ${escapedName} удален за спам`,
                  parseMode: "MarkdownV2",
                  autoDelete: 20000,
                },
              },
              {
                type: "kick",
                params: {
                  userId: event.from.id,
                  clearCounter: true,
                },
              },
            )
          }

          // Генерируем событие обнаружения спама с действиями
          await this.eventBus!.emitSpamDetected({
            chatId: event.chat.id,
            userId: event.from.id,
            messageId: event.id,
            username: event.from.username,
            firstName: event.from.firstName,
            spamCount,
            actions,
          })
        }
      } catch (error) {
        this.logger.e("Error in spam detection:", error)
      }
    })
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
    this.logger.i(`🔍 Checking message for spam: ${text}`)
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
