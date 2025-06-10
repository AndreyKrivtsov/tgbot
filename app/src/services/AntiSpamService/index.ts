import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { IService } from "../../core/Container.js"

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
  timeoutMs: number          // Таймаут запроса (по умолчанию 5 секунд)
  maxRetries: number         // Максимальное количество попыток (по умолчанию 2)
  retryDelayMs: number       // Задержка между попытками (по умолчанию 1 секунда)
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
    settings?: Partial<AntiSpamSettings>
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
    
    // Настройки по умолчанию
    this.settings = {
      timeoutMs: 5000,      // 5 секунд
      maxRetries: 2,        // 2 попытки
      retryDelayMs: 1000,   // 1 секунда
      ...settings
    }
  }

  /**
   * Инициализация сервиса антиспама
   */
  async initialize(): Promise<void> {
    this.logger.i("🛡️ Initializing anti-spam service...")
    this.logger.d("🔧 AntiSpam settings:", JSON.stringify(this.settings, null, 2))
    
    if (!this.config.ANTISPAM_URL) {
      this.logger.w("⚠️ ANTISPAM_URL not configured, service will be disabled")
      this.logger.w("🔧 Current config.ANTISPAM_URL:", this.config.ANTISPAM_URL)
      return
    }
    
    this.logger.i(`🔗 Anti-spam API URL: ${this.config.ANTISPAM_URL}`)
    this.logger.d("🔧 AntiSpam initialization complete with settings:", JSON.stringify(this.settings, null, 2))
    this.logger.i("✅ Anti-spam service initialized")
  }

  /**
   * Запуск сервиса антиспама
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting anti-spam service...")
    this.logger.d("🔧 Starting with config ANTISPAM_URL:", this.config.ANTISPAM_URL)
    this.isRunning = true
    
    // Проверяем доступность API
    this.logger.d("🏥 Performing initial health check...")
    await this.healthCheck()
    
    this.logger.i("✅ Anti-spam service started")
    this.logger.d("🔧 Service status - isRunning:", this.isRunning, "isHealthy:", this.isHealthy())
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
    this.logger.d(`🔍 [DEBUG] checkMessage called - userId: ${userId}, messageLength: ${message?.length || 0}`)
    this.logger.d(`🔍 [DEBUG] Service status - isRunning: ${this.isRunning}, hasURL: ${!!this.config.ANTISPAM_URL}`)
    
    if (!this.isRunning) {
      this.logger.w("❌ [DEBUG] Anti-spam service is not running")
      return { isSpam: false, error: "Service not running" }
    }

    if (!this.config.ANTISPAM_URL) {
      this.logger.w("❌ [DEBUG] ANTISPAM_URL not configured:", this.config.ANTISPAM_URL)
      return { isSpam: false, error: "API URL not configured" }
    }

    if (!message || message.trim().length === 0) {
      this.logger.d("⚪ [DEBUG] Empty message, skipping spam check")
      return { isSpam: false, reason: "Empty message" }
    }

    this.logger.i(`🔍 [DEBUG] Checking message from user ${userId} for spam`)
    this.logger.d(`📝 [DEBUG] Message content (first 100 chars): "${message.substring(0, 100)}${message.length > 100 ? '...' : ''}"`)
    
    try {
      this.logger.d(`📡 [DEBUG] Calling anti-spam API...`)
      const result = await this.callAntiSpamAPI(message)
      
      this.logger.d(`📋 [DEBUG] API response:`, JSON.stringify(result, null, 2))
      
      if (result.isSpam) {
        this.logger.w(`🚨 [DEBUG] Spam detected from user ${userId}: ${result.reason || 'Unknown reason'}`)
        this.logger.w(`🚨 [DEBUG] Spam confidence: ${result.confidence || 'Not provided'}`)
      } else {
        this.logger.i(`✅ [DEBUG] Message from user ${userId} is clean`)
      }
      
      return result
    } catch (error) {
      this.logger.e("❌ [DEBUG] Error checking message for spam:", error)
      this.logger.e("❌ [DEBUG] Error details:", error instanceof Error ? error.stack : String(error))
      return { 
        isSpam: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }
    }
  }

  /**
   * Вызов внешнего API антиспама с повторными попытками
   */
  private async callAntiSpamAPI(text: string): Promise<AntiSpamResult> {
    let lastError: Error | null = null
    
    this.logger.d(`📡 [DEBUG] Starting API call with ${this.settings.maxRetries} max retries`)
    this.logger.d(`📡 [DEBUG] API URL: ${this.config.ANTISPAM_URL}`)
    this.logger.d(`📡 [DEBUG] Timeout: ${this.settings.timeoutMs}ms, Retry delay: ${this.settings.retryDelayMs}ms`)
    
    for (let attempt = 1; attempt <= this.settings.maxRetries; attempt++) {
      try {
        this.logger.i(`📡 [DEBUG] Anti-spam API call attempt ${attempt}/${this.settings.maxRetries}`)
        
        const response = await this.makeHttpRequest(text)
        
        this.logger.d(`📡 [DEBUG] HTTP response status: ${response.status} ${response.statusText}`)
        this.logger.d(`📡 [DEBUG] Response headers:`, Object.fromEntries(response.headers.entries()))
        
        if (response.ok) {
          const responseText = await response.text()
          this.logger.d(`📡 [DEBUG] Raw response body: "${responseText}"`)
          
          try {
            const data = JSON.parse(responseText) as AntiSpamAPIResponse
            this.logger.d(`📡 [DEBUG] Parsed response data:`, JSON.stringify(data, null, 2))
            
            return {
              isSpam: Boolean(data.is_spam),
              confidence: data.confidence,
              reason: data.reason
            }
          } catch (parseError) {
            this.logger.e(`❌ [DEBUG] Failed to parse JSON response: ${parseError}`)
            this.logger.e(`❌ [DEBUG] Raw response was: "${responseText}"`)
            throw new Error(`Invalid JSON response: ${parseError}`)
          }
        } else {
          const errorBody = await response.text()
          this.logger.e(`❌ [DEBUG] HTTP error response body: "${errorBody}"`)
          throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorBody}`)
        }
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        this.logger.w(`⚠️ [DEBUG] Anti-spam API attempt ${attempt} failed: ${lastError.message}`)
        this.logger.w(`⚠️ [DEBUG] Error stack:`, lastError.stack)
        
        // Если это не последняя попытка, ждем перед следующей
        if (attempt < this.settings.maxRetries) {
          this.logger.d(`⏳ [DEBUG] Waiting ${this.settings.retryDelayMs}ms before retry...`)
          await this.delay(this.settings.retryDelayMs)
        }
      }
    }
    
    this.logger.e(`❌ [DEBUG] All ${this.settings.maxRetries} attempts failed`)
    throw lastError || new Error('All retry attempts failed')
  }

  /**
   * Выполнение HTTP запроса к антиспам API
   */
  private async makeHttpRequest(text: string): Promise<Response> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), this.settings.timeoutMs)
    
    const requestBody = JSON.stringify({ text })
    this.logger.d(`📡 [DEBUG] Making HTTP request to: ${this.config.ANTISPAM_URL}`)
    this.logger.d(`📡 [DEBUG] Request method: POST`)
    this.logger.d(`📡 [DEBUG] Request headers: {"Content-Type": "application/json"}`)
    this.logger.d(`📡 [DEBUG] Request body: ${requestBody}`)
    this.logger.d(`📡 [DEBUG] Request timeout: ${this.settings.timeoutMs}ms`)
    
    try {
      this.logger.d(`📡 [DEBUG] Sending fetch request...`)
      const response = await fetch(this.config.ANTISPAM_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: requestBody,
        signal: controller.signal
      })
      
      this.logger.d(`📡 [DEBUG] Fetch completed successfully`)
      return response
    } catch (error) {
      this.logger.e(`❌ [DEBUG] Fetch failed:`, error)
      if (error instanceof Error && error.name === 'AbortError') {
        this.logger.e(`❌ [DEBUG] Request was aborted due to timeout (${this.settings.timeoutMs}ms)`)
      }
      throw error
    } finally {
      clearTimeout(timeoutId)
      this.logger.d(`📡 [DEBUG] Request cleanup completed`)
    }
  }

  /**
   * Проверка доступности API (health check)
   */
  private async healthCheck(): Promise<void> {
    try {
      this.logger.d("🏥 Performing anti-spam API health check...")
      
      // Проверяем с простым тестовым сообщением
      const testResult = await this.callAntiSpamAPI("test message")
      
      this.logger.i("✅ Anti-spam API is healthy")
      this.logger.d(`Health check result: isSpam=${testResult.isSpam}`)
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
    this.logger.i("📝 Anti-spam settings updated:", newSettings)
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
      settings: this.settings
    }
  }

  /**
   * Тестовая проверка работы антиспама (для отладки)
   */
  async testAntiSpam(): Promise<void> {
    this.logger.i("🧪 [DEBUG] Running AntiSpam test...")
    
    try {
      const testResult = await this.checkMessage(999999, "This is a test message for debugging")
      this.logger.i("🧪 [DEBUG] Test result:", JSON.stringify(testResult, null, 2))
    } catch (error) {
      this.logger.e("🧪 [DEBUG] Test failed:", error)
    }
  }
} 