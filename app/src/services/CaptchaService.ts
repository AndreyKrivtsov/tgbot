import type { IService } from "../core/Container.js"
import type { Logger } from "../helpers/Logger.js"
import type { AppConfig } from "../config.js"

interface CaptchaDependencies {
  repository?: any
  telegramBot?: any
}

interface CaptchaChallenge {
  question: number[]
  answer: number
  options: number[]
}

interface RestrictedUser {
  userId: number
  chatId: number
  questionId: number
  answer: number
  username?: string
  firstname: string
  timestamp: number
  isAnswered: boolean
}

/**
 * Сервис капчи для проверки новых пользователей
 */
export class CaptchaService implements IService {
  private config: AppConfig
  private logger: Logger
  private dependencies: CaptchaDependencies
  private restrictedUsers: Map<number, RestrictedUser> = new Map()
  private isMonitoring = false

  constructor(config: AppConfig, logger: Logger, dependencies: CaptchaDependencies = {}) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
  }

  /**
   * Инициализация сервиса капчи
   */
  async initialize(): Promise<void> {
    this.logger.i("🔐 Initializing captcha service...")
    this.logger.i("✅ Captcha service initialized")
  }

  /**
   * Запуск сервиса капчи
   */
  async start(): Promise<void> {
    this.logger.i("🚀 Starting captcha service...")
    
    // Запускаем мониторинг таймаутов
    this.startTimeoutMonitoring()
    
    this.logger.i("✅ Captcha service started")
  }

  /**
   * Остановка сервиса капчи
   */
  async stop(): Promise<void> {
    this.logger.i("🛑 Stopping captcha service...")
    this.isMonitoring = false
    this.restrictedUsers.clear()
    this.logger.i("✅ Captcha service stopped")
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    this.logger.i("🗑️ Disposing captcha service...")
    await this.stop()
    this.logger.i("✅ Captcha service disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return true
  }

  /**
   * Генерация математической капчи
   */
  generateCaptcha(): CaptchaChallenge {
    const randomOption = (from: number, to: number) => {
      return Math.floor(Math.random() * (to - from + 1)) + from
    }

    // Генерируем задачу сложения
    const num1 = randomOption(1, 10)
    const num2 = randomOption(1, 10)
    const question: number[] = [num1, num2]
    const answer = num1 + num2

    // Генерируем неправильные варианты ответов
    const options: number[] = []
    while (options.length < 3) {
      const option = randomOption(1, 20)
      if (!options.includes(option) && option !== answer) {
        options.push(option)
      }
    }

    // Вставляем правильный ответ в случайную позицию
    const insertIndex = randomOption(0, 3)
    options.splice(insertIndex, 0, answer)

    return { question, answer, options }
  }

  /**
   * Добавление пользователя в список ограниченных
   */
  addRestrictedUser(
    userId: number,
    chatId: number,
    questionId: number,
    answer: number,
    username?: string,
    firstname: string = "Unknown"
  ): void {
    const restrictedUser: RestrictedUser = {
      userId,
      chatId,
      questionId,
      answer,
      username,
      firstname,
      timestamp: Date.now(),
      isAnswered: false
    }

    this.restrictedUsers.set(userId, restrictedUser)
    
    this.logger.d(`User ${userId} (${firstname}) restricted in chat ${chatId}`)
  }

  /**
   * Проверка правильности ответа на капчу
   */
  validateAnswer(userId: number, questionId: number, userAnswer: number): {
    isValid: boolean
    user?: RestrictedUser
  } {
    const restrictedUser = this.restrictedUsers.get(userId)

    if (!restrictedUser) {
      return { isValid: false }
    }

    if (restrictedUser.isAnswered) {
      return { isValid: false, user: restrictedUser }
    }

    if (restrictedUser.questionId !== questionId) {
      return { isValid: false, user: restrictedUser }
    }

    const isCorrect = restrictedUser.answer === userAnswer
    restrictedUser.isAnswered = true

    this.logger.i(
      `Captcha answer from ${restrictedUser.firstname} (${userId}): ${userAnswer} - ${isCorrect ? 'CORRECT' : 'WRONG'}`
    )

    return { isValid: isCorrect, user: restrictedUser }
  }

  /**
   * Удаление пользователя из списка ограниченных
   */
  removeRestrictedUser(userId: number): RestrictedUser | undefined {
    const user = this.restrictedUsers.get(userId)
    this.restrictedUsers.delete(userId)
    
    if (user) {
      this.logger.d(`User ${userId} removed from restricted list`)
    }
    
    return user
  }

  /**
   * Проверка, ограничен ли пользователь
   */
  isUserRestricted(userId: number): boolean {
    return this.restrictedUsers.has(userId)
  }

  /**
   * Получение ограниченного пользователя
   */
  getRestrictedUser(userId: number): RestrictedUser | undefined {
    return this.restrictedUsers.get(userId)
  }

  /**
   * Получение всех ограниченных пользователей
   */
  getAllRestrictedUsers(): RestrictedUser[] {
    return Array.from(this.restrictedUsers.values())
  }

  /**
   * Мониторинг таймаутов капчи
   */
  private startTimeoutMonitoring(): void {
    if (this.isMonitoring) return

    this.isMonitoring = true
    const timeoutDuration = 60000 // 60 секунд

    const checkTimeouts = () => {
      if (!this.isMonitoring) return

      const now = Date.now()
      const expiredUsers: RestrictedUser[] = []

      for (const user of this.restrictedUsers.values()) {
        if (!user.isAnswered && now > user.timestamp + timeoutDuration) {
          expiredUsers.push(user)
        }
      }

      // Обрабатываем истекшие капчи
      for (const user of expiredUsers) {
        this.handleCaptchaTimeout(user)
        this.restrictedUsers.delete(user.userId)
      }

      // Планируем следующую проверку
      setTimeout(checkTimeouts, 5000)
    }

    checkTimeouts()
  }

  /**
   * Обработка таймаута капчи
   */
  private handleCaptchaTimeout(user: RestrictedUser): void {
    this.logger.w(`Captcha timeout for user ${user.userId} (${user.firstname}) in chat ${user.chatId}`)
    
    // Эмитируем событие для TelegramBotService
    // В реальной реализации здесь будет EventBus или прямой вызов
    this.onCaptchaTimeout?.(user)
  }

  /**
   * Колбэк для обработки таймаута (будет подключен TelegramBotService)
   */
  public onCaptchaTimeout?: (user: RestrictedUser) => void

  /**
   * Колбэк для обработки успешной капчи (будет подключен TelegramBotService)
   */
  public onCaptchaSuccess?: (user: RestrictedUser) => void

  /**
   * Колбэк для обработки неправильной капчи (будет подключен TelegramBotService)
   */
  public onCaptchaFailed?: (user: RestrictedUser) => void

  /**
   * Получение статистики капчи
   */
  getStats(): object {
    return {
      restrictedUsers: this.restrictedUsers.size,
      isMonitoring: this.isMonitoring,
      serviceStatus: "active"
    }
  }
} 