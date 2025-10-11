import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"

interface CaptchaDependencies {
  now?: () => number
  setTimeoutFn?: (fn: () => void, ms: number) => any
  rng?: () => number
  actions?: CaptchaActionsPort
  repository?: CaptchaRepository
  policy?: Partial<CaptchaPolicy>
}

export interface CaptchaSettings {
  timeoutMs: number // Таймаут капчи (по умолчанию 60 сек)
  checkIntervalMs: number // Интервал проверки истекших капч (по умолчанию 5 сек)
}

export interface CaptchaChallenge {
  question: number[]
  answer: number
  options: number[]
}

export interface RestrictedUser {
  userId: number
  chatId: number
  questionId: number
  answer: number
  username?: string
  firstName: string
  timestamp: number
  isAnswered: boolean
}

// ===================== Ports / Policies =====================
export interface CaptchaActionsPort {
  sendCaptchaMessage: (
    chatId: number,
    userId: number,
    question: number[],
    options: number[],
    correctAnswer: number,
  ) => Promise<number>
  sendResultMessage: (chatId: number, text: string, autoDeleteMs?: number) => Promise<void>
  restrictUser: (chatId: number, userId: number, durationSec?: number) => Promise<void>
  unrestrictUser: (chatId: number, userId: number) => Promise<void>
  kickUser: (chatId: number, userId: number, userName: string, autoUnbanDelayMs?: number) => Promise<void>
  deleteMessage: (chatId: number, messageId: number) => Promise<void>
}

export interface CaptchaRepository {
  save: (user: RestrictedUser) => Promise<void>
  get: (userId: number) => Promise<RestrictedUser | null>
  remove: (userId: number) => Promise<void>
  list: () => Promise<RestrictedUser[]>
}

export interface CaptchaPolicy {
  temporaryBanDurationSec: number
  autoUnbanDelayMs: number
  resultMessageDeleteMs: number
  duplicateWindowMs: number
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
  // helpers
  private getNow: () => number
  private setTimeoutWrapper: (fn: () => void, ms: number) => any
  private random: () => number
  // ports
  private actions?: CaptchaActionsPort
  private repo?: CaptchaRepository
  private policy: CaptchaPolicy = {
    temporaryBanDurationSec: 40,
    autoUnbanDelayMs: 5000,
    resultMessageDeleteMs: 10000,
    duplicateWindowMs: 2000,
  }

  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: CaptchaDependencies = {},
    settings?: Partial<CaptchaSettings>,
  ) {
    this.config = config
    this.logger = logger
    this.dependencies = dependencies

    // Настройки по умолчанию
    this.settings = {
      timeoutMs: 60000, // 60 секунд
      checkIntervalMs: 5000, // 5 секунд
      ...settings,
    }

    // Wire helpers with fallbacks to globals
    this.getNow = this.dependencies.now || (() => Date.now())
    this.setTimeoutWrapper = this.dependencies.setTimeoutFn || ((fn: () => void, ms: number) => setTimeout(fn, ms))
    this.random = this.dependencies.rng || (() => Math.random())

    // wire ports
    this.actions = this.dependencies.actions
    this.repo = this.dependencies.repository
    if (this.dependencies.policy) {
      this.policy = { ...this.policy, ...this.dependencies.policy }
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
    const randomOption = (from: number, to: number) => {
      return Math.floor(this.random() * (to - from + 1)) + from
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

  // ===================== Use-cases (Orchestration) =====================
  async startChallenge(input: { chatId: number, userId: number, username?: string, firstName: string }): Promise<void> {
    const { chatId, userId, username, firstName } = input
    const now = this.getNow()

    // Дедупликация по окну
    const existing = await this.getRestrictedFromStore(userId)
    if (existing && (now - existing.timestamp) < this.policy.duplicateWindowMs) {
      this.logger.i(`🔄 Captcha already started for user ${userId}, skipping`)
      return
    }

    // Сгенерировать задачу и отправить сообщение
    const challenge = this.generateCaptcha()
    const questionId = this.actions
      ? await this.actions.sendCaptchaMessage(chatId, userId, challenge.question, challenge.options, challenge.answer)
      : 0

    // Сохранить состояние
    const restricted: RestrictedUser = {
      userId,
      chatId,
      questionId,
      answer: challenge.answer,
      username,
      firstName,
      timestamp: now,
      isAnswered: false,
    }
    await this.saveRestrictedToStore(restricted)

    // Выдать mute (restrict)
    if (this.actions) {
      await this.actions.restrictUser(chatId, userId)
    }
  }

  async submitAnswer(input: { userId: number, questionId?: number, answer?: number, isCorrect?: boolean }): Promise<void> {
    const { userId, questionId, answer, isCorrect } = input
    const restricted = await this.getRestrictedFromStore(userId)
    if (!restricted)
      return

    // валидация
    const computedCorrect = typeof isCorrect === "boolean"
      ? isCorrect
      : ((questionId === undefined || restricted.questionId === questionId) && (answer !== undefined && restricted.answer === answer))
    restricted.isAnswered = true

    if (!this.actions) {
      await this.removeRestrictedFromStore(userId)
      return
    }

    if (computedCorrect) {
      await this.actions.unrestrictUser(restricted.chatId, restricted.userId)
      await this.actions.deleteMessage(restricted.chatId, restricted.questionId)
      await this.actions.sendResultMessage(restricted.chatId, "✅ Капча пройдена", this.policy.resultMessageDeleteMs)
    } else {
      await this.actions.deleteMessage(restricted.chatId, restricted.questionId)
      await this.actions.kickUser(restricted.chatId, restricted.userId, restricted.firstName, this.policy.autoUnbanDelayMs)
    }

    await this.removeRestrictedFromStore(userId)
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
    firstName: string = "Unknown",
  ): void {
    const restrictedUser: RestrictedUser = {
      userId,
      chatId,
      questionId,
      answer,
      username,
      firstName,
      timestamp: this.getNow(),
      isAnswered: false,
    }

    this.restrictedUsers.set(userId, restrictedUser)
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

    // Проверяем правильность ответа
    const isCorrect = restrictedUser.answer === userAnswer

    // Отмечаем как отвеченный
    restrictedUser.isAnswered = true

    // Колбэки удалены — метод оставлен для обратной совместимости тестов.
    this.restrictedUsers.delete(userId)
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
      this.logger.i(`✅ User ${userId} (${user.firstName}) removed from restrictions`)
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
      if (!this.isMonitoring)
        return

      const now = this.getNow()
      const expiredUsers: RestrictedUser[] = []

      for (const [userId, user] of this.restrictedUsers) {
        if (!user.isAnswered && (now - user.timestamp) > this.settings.timeoutMs) {
          this.logger.w(`⏰ Captcha timeout for user ${userId} (${user.firstName})`)
          expiredUsers.push(user)
        }
      }

      // Обрабатываем истекших пользователей
      for (const user of expiredUsers) {
        this.handleCaptchaTimeout(user)
        this.restrictedUsers.delete(user.userId)
      }

      if (this.isMonitoring) {
        this.setTimeoutWrapper(checkTimeouts, this.settings.checkIntervalMs)
      }
    }

    checkTimeouts()
  }

  /**
   * Обработка таймаута капчи
   */
  private handleCaptchaTimeout(user: RestrictedUser): void {
    this.logger.i(`⏰ Handling captcha timeout for user ${user.userId} (${user.firstName})`)

    // Новая оркестрация таймаута
    if (this.actions) {
      void this.actions.deleteMessage(user.chatId, user.questionId)
      // Временный бан, затем авторазбан (реализуется в адаптере через kick+delay или ban+unban)
      void this.actions.restrictUser(user.chatId, user.userId, this.policy.temporaryBanDurationSec)
    }
  }

  // Колбэки для обработки событий капчи
  // legacy callbacks удалены — оркестрация внутри сервиса

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
      isMonitoring: this.isMonitoring,
    }
  }

  // ===================== Internal store helpers =====================
  private async getRestrictedFromStore(userId: number): Promise<RestrictedUser | null> {
    if (this.repo) {
      return await this.repo.get(userId)
    }
    return this.restrictedUsers.get(userId) || null
  }

  // ===================== Policy wiring =====================
  updatePolicy(newPolicy: Partial<CaptchaPolicy>): void {
    this.policy = { ...this.policy, ...newPolicy }
    this.logger.i("⚙️ Captcha policy updated", newPolicy)
  }

  private async saveRestrictedToStore(user: RestrictedUser): Promise<void> {
    if (this.repo) {
      await this.repo.save(user)
    } else {
      this.restrictedUsers.set(user.userId, user)
    }
  }

  private async removeRestrictedFromStore(userId: number): Promise<void> {
    if (this.repo) {
      await this.repo.remove(userId)
    } else {
      this.restrictedUsers.delete(userId)
    }
  }
}
