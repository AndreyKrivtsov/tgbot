import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"

interface CaptchaDependencies {
  repository?: any
  telegramBot?: any
}

interface CaptchaSettings {
  timeoutMs: number          // Таймаут капчи (по умолчанию 60 сек)
  checkIntervalMs: number    // Интервал проверки истекших капч (по умолчанию 5 сек)
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
  private settings: CaptchaSettings
  private restrictedUsers: Map<number, RestrictedUser> = new Map()
  private isMonitoring = false

  constructor(
    config: AppConfig, 
    logger: Logger, 
    dependencies: CaptchaDependencies = {},
    settings?: Partial<CaptchaSettings>
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies
    
    // Настройки по умолчанию
    this.settings = {
      timeoutMs: 60000,         // 60 секунд
      checkIntervalMs: 5000,    // 5 секунд
      ...settings
    }
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
    this.logger.d("🎲 Starting captcha generation...")
    
    const randomOption = (from: number, to: number) => {
      return Math.floor(Math.random() * (to - from + 1)) + from
    }

    // Генерируем задачу сложения
    const num1 = randomOption(1, 10)
    const num2 = randomOption(1, 10)
    const question: number[] = [num1, num2]
    const answer = num1 + num2

    this.logger.d(`🧮 Math problem: ${num1} + ${num2} = ${answer}`)

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

    this.logger.d(`🔢 Generated options: [${options.join(', ')}], correct answer at index ${insertIndex}`)

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
    this.logger.i(`🔒 Adding user ${userId} (${firstname}) to restricted list`)
    this.logger.d(`Details: chatId=${chatId}, questionId=${questionId}, answer=${answer}`)
    
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
    
    this.logger.i(`✅ User ${userId} (${firstname}) restricted in chat ${chatId}`)
    this.logger.d(`Total restricted users: ${this.restrictedUsers.size}`)
  }

  /**
   * Проверка правильности ответа на капчу
   */
  validateAnswer(userId: number, questionId: number, userAnswer: number): {
    isValid: boolean
    user?: RestrictedUser
  } {
    this.logger.i(`🔍 Validating answer for user ${userId}, questionId=${questionId}, answer=${userAnswer}`)
    
    const restrictedUser = this.restrictedUsers.get(userId)

    if (!restrictedUser) {
      this.logger.w(`❌ No restricted user found with ID ${userId}`)
      return { isValid: false }
    }

    this.logger.d(`👤 Found restricted user: ${restrictedUser.firstname} (${restrictedUser.userId})`)

    if (restrictedUser.isAnswered) {
      this.logger.w(`⚠️ User ${userId} already answered the captcha`)
      return { isValid: false, user: restrictedUser }
    }

    if (restrictedUser.questionId !== questionId) {
      this.logger.w(`⚠️ Question ID mismatch: expected ${restrictedUser.questionId}, got ${questionId}`)
      return { isValid: false, user: restrictedUser }
    }

    const isCorrect = restrictedUser.answer === userAnswer

    if (isCorrect) {
      this.logger.i(`✅ User ${userId} (${restrictedUser.firstname}) answered correctly!`)
      restrictedUser.isAnswered = true
      
      // Вызываем колбэк успеха
      if (this.onCaptchaSuccess) {
        this.onCaptchaSuccess(restrictedUser)
      }
    } else {
      this.logger.w(`❌ User ${userId} (${restrictedUser.firstname}) answered incorrectly. Expected: ${restrictedUser.answer}, got: ${userAnswer}`)
      
      // Вызываем колбэк неудачи
      if (this.onCaptchaFailed) {
        this.onCaptchaFailed(restrictedUser)
      }
    }

    return { isValid: isCorrect, user: restrictedUser }
  }

  /**
   * Удаление пользователя из списка ограниченных
   */
  removeRestrictedUser(userId: number): RestrictedUser | undefined {
    this.logger.i(`🔓 Removing user ${userId} from restricted list`)
    
    const user = this.restrictedUsers.get(userId)
    if (user) {
      this.restrictedUsers.delete(userId)
      this.logger.i(`✅ User ${userId} (${user.firstname}) removed from restrictions`)
      this.logger.d(`Remaining restricted users: ${this.restrictedUsers.size}`)
    } else {
      this.logger.w(`⚠️ User ${userId} was not in restricted list`)
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
   * Получение информации об ограниченном пользователе
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
   * Запуск мониторинга таймаутов
   */
  private startTimeoutMonitoring(): void {
    this.isMonitoring = true
    
    const checkTimeouts = () => {
      if (!this.isMonitoring) return

      const now = Date.now()
      const expiredUsers: RestrictedUser[] = []
      
      for (const [userId, user] of this.restrictedUsers) {
        if (!user.isAnswered && (now - user.timestamp) > this.settings.timeoutMs) {
          this.logger.w(`⏰ Captcha timeout for user ${userId} (${user.firstname})`)
          expiredUsers.push(user)
        }
      }

      // Обрабатываем истекших пользователей
      for (const user of expiredUsers) {
        this.handleCaptchaTimeout(user)
        this.restrictedUsers.delete(user.userId)
      }

      if (this.isMonitoring) {
        setTimeout(checkTimeouts, this.settings.checkIntervalMs)
      }
    }

    checkTimeouts()
  }

  /**
   * Обработка таймаута капчи
   */
  private handleCaptchaTimeout(user: RestrictedUser): void {
    this.logger.i(`⏰ Handling captcha timeout for user ${user.userId} (${user.firstname})`)
    
    // Вызываем колбэк таймаута
    if (this.onCaptchaTimeout) {
      this.onCaptchaTimeout(user)
    }
  }

  // Колбэки для обработки событий капчи
  public onCaptchaTimeout?: (user: RestrictedUser) => void

  /**
   * Колбэк успешного прохождения капчи
   */
  public onCaptchaSuccess?: (user: RestrictedUser) => void

  /**
   * Колбэк неудачного прохождения капчи
   */
  public onCaptchaFailed?: (user: RestrictedUser) => void

  /**
   * Получение текущих настроек
   */
  getSettings(): CaptchaSettings {
    return { ...this.settings }
  }

  /**
   * Обновление настроек
   */
  updateSettings(newSettings: Partial<CaptchaSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    this.logger.i("⚙️ Captcha settings updated:", newSettings)
  }

  /**
   * Получение статистики
   */
  getStats(): object {
    return {
      restrictedUsersCount: this.restrictedUsers.size,
      isMonitoring: this.isMonitoring
    }
  }
} 