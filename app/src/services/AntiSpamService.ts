import type { IService } from "../core/Container.js"
import type { Logger } from "../helpers/Logger.js"
import type { AppConfig } from "../config.js"

interface AntiSpamDependencies {
  aiService?: any
}

interface UserSpamCheck {
  userId: number
  messageCount: number
  isChecking: boolean
  lastCheckTime: number
}

/**
 * Сервис антиспама для проверки первых сообщений пользователей
 */
export class AntiSpamService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: AntiSpamDependencies
  private userChecks: Map<number, UserSpamCheck> = new Map()
  private maxMessagesToCheck = 5

  constructor(config: AppConfig, logger: Logger, dependencies: AntiSpamDependencies = {}) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
  }

  /**
   * Инициализация сервиса антиспама
   */
  async initialize(): Promise<void> {
    this.logger.i("🛡️ Initializing anti-spam service...")
    this.logger.i("✅ Anti-spam service initialized")
  }

  /**
   * Запуск сервиса антиспама
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting anti-spam service...")
    this.logger.i("✅ Anti-spam service started")
  }

  /**
   * Остановка сервиса антиспама
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping anti-spam service...")
    this.userChecks.clear()
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
    return true
  }

  /**
   * Проверка сообщения на спам
   */
  async checkMessage(userId: number, message: string): Promise<{
    isSpam: boolean
    shouldCheck: boolean
    reason?: string
  }> {
    try {
      // Получаем или создаем запись о пользователе
      let userCheck = this.userChecks.get(userId)
      if (!userCheck) {
        userCheck = {
          userId,
          messageCount: 0,
          isChecking: false,
          lastCheckTime: Date.now()
        }
        this.userChecks.set(userId, userCheck)
      }

      // Увеличиваем счетчик сообщений
      userCheck.messageCount++
      userCheck.lastCheckTime = Date.now()

      // Проверяем, нужно ли проверять сообщение
      if (userCheck.messageCount > this.maxMessagesToCheck) {
        return { isSpam: false, shouldCheck: false, reason: "User passed initial checks" }
      }

      // Проверяем базовые фильтры
      const basicCheck = this.performBasicChecks(message)
      if (basicCheck.isSpam) {
        this.logger.w(`Basic spam detected from user ${userId}: ${basicCheck.reason}`)
        return basicCheck
      }

      // Используем AI для глубокой проверки
      if (this.dependencies.aiService && !userCheck.isChecking) {
        userCheck.isChecking = true
        
        try {
          const aiResult = await this.checkWithAI(message)
          userCheck.isChecking = false
          
          if (aiResult.isSpam) {
            this.logger.w(`AI spam detected from user ${userId}: ${aiResult.reason}`)
          } else {
            this.logger.d(`Message from user ${userId} passed AI check`)
          }
          
          return aiResult
        } catch (error) {
          userCheck.isChecking = false
          this.logger.e("AI spam check failed:", error)
          return { isSpam: false, shouldCheck: true, reason: "AI check failed" }
        }
      }

      return { isSpam: false, shouldCheck: true }
    } catch (error) {
      this.logger.e("Error in spam check:", error)
      return { isSpam: false, shouldCheck: false, reason: "Check error" }
    }
  }

  /**
   * Базовые проверки на спам
   */
  private performBasicChecks(message: string): {
    isSpam: boolean
    shouldCheck: boolean
    reason?: string
  } {
    // Слишком длинное сообщение
    if (message.length > 1000) {
      return { isSpam: true, shouldCheck: true, reason: "Message too long" }
    }

    // Много повторяющихся символов
    if (this.hasRepeatingPatterns(message)) {
      return { isSpam: true, shouldCheck: true, reason: "Repeating patterns detected" }
    }

    // Много ссылок
    const urlCount = (message.match(/https?:\/\/[^\s]+/g) || []).length
    if (urlCount > 2) {
      return { isSpam: true, shouldCheck: true, reason: "Too many URLs" }
    }

    // Спам-слова
    const spamKeywords = [
      'заработок', 'деньги быстро', 'без вложений', 'пирамида',
      'купить дешево', 'акция', 'скидка', 'бесплатно', 'выиграй'
    ]
    
    const lowerMessage = message.toLowerCase()
    for (const keyword of spamKeywords) {
      if (lowerMessage.includes(keyword)) {
        return { isSpam: true, shouldCheck: true, reason: `Spam keyword: ${keyword}` }
      }
    }

    return { isSpam: false, shouldCheck: true }
  }

  /**
   * Проверка на повторяющиеся паттерны
   */
  private hasRepeatingPatterns(message: string): boolean {
    // Проверка на повторяющиеся символы (больше 5 подряд)
    if (/(.)\1{5,}/.test(message)) {
      return true
    }

    // Проверка на повторяющиеся слова
    const words = message.split(/\s+/)
    for (let i = 0; i < words.length - 2; i++) {
      const word = words[i]
      if (word && word.length > 2) {
        let consecutiveCount = 1
        for (let j = i + 1; j < words.length; j++) {
          if (words[j] === word) {
            consecutiveCount++
            if (consecutiveCount >= 3) {
              return true
            }
          } else {
            break
          }
        }
      }
    }

    return false
  }

  /**
   * Проверка сообщения через AI
   */
  private async checkWithAI(message: string): Promise<{
    isSpam: boolean
    shouldCheck: boolean
    reason?: string
  }> {
    if (!this.dependencies.aiService) {
      return { isSpam: false, shouldCheck: true, reason: "AI service not available" }
    }

    try {
      const prompt = `Проанализируй это сообщение и определи, является ли оно спамом. Отвечай только "СПАМ" или "НЕ СПАМ":

Сообщение: "${message}"

Критерии спама:
- Реклама товаров/услуг
- Призывы к переходам по ссылкам
- Предложения заработка
- Навязчивая реклама
- Мошенничество
- Повторяющийся контент

Ответ:`

      // В реальной реализации здесь будет вызов AI сервиса
      const aiResponse = await this.dependencies.aiService.checkSpam?.(prompt)
      
      if (!aiResponse) {
        return { isSpam: false, shouldCheck: true, reason: "No AI response" }
      }

      const isSpam = aiResponse.toLowerCase().includes('спам')
      
      return {
        isSpam,
        shouldCheck: true,
        reason: isSpam ? "AI detected spam" : "AI approved message"
      }
    } catch (error) {
      this.logger.e("AI spam check error:", error)
      return { isSpam: false, shouldCheck: true, reason: "AI check failed" }
    }
  }

  /**
   * Получение статистики пользователя
   */
  getUserStats(userId: number): UserSpamCheck | null {
    return this.userChecks.get(userId) || null
  }

  /**
   * Сброс проверок для пользователя
   */
  resetUserChecks(userId: number): void {
    this.userChecks.delete(userId)
    this.logger.d(`Reset spam checks for user ${userId}`)
  }

  /**
   * Настройка количества проверяемых сообщений
   */
  setMaxMessagesToCheck(count: number): void {
    this.maxMessagesToCheck = Math.max(1, Math.min(count, 20))
    this.logger.i(`Set max messages to check: ${this.maxMessagesToCheck}`)
  }

  /**
   * Очистка старых записей
   */
  cleanupOldRecords(): void {
    const now = Date.now()
    const maxAge = 24 * 60 * 60 * 1000 // 24 часа

    for (const [userId, userCheck] of this.userChecks.entries()) {
      if (now - userCheck.lastCheckTime > maxAge) {
        this.userChecks.delete(userId)
      }
    }

    this.logger.d("Cleaned up old spam check records")
  }

  /**
   * Получение статистики сервиса
   */
  getStats(): object {
    return {
      trackedUsers: this.userChecks.size,
      maxMessagesToCheck: this.maxMessagesToCheck,
      serviceStatus: "active"
    }
  }
} 