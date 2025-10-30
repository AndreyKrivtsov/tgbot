import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { EventBus } from "../../core/EventBus.js"
import { getMessage } from "../TelegramBot/utils/Messages.js"

interface CaptchaDependencies {
  now?: () => number
  setTimeoutFn?: (fn: () => void, ms: number) => any
  rng?: () => number
  repository?: CaptchaRepository
  policy?: Partial<CaptchaPolicy>
  eventBus?: EventBus
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
  private repo?: CaptchaRepository
  private eventBus?: EventBus
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
    this.repo = this.dependencies.repository
    this.eventBus = this.dependencies.eventBus
    if (this.dependencies.policy) {
      this.policy = { ...this.policy, ...this.dependencies.policy }
    }
  }

  /**
   * Инициализация сервиса капчи
   */
  async initialize(): Promise<void> {
    this.logger.i("🔐 Initializing captcha service...")

    // Подписываемся на событие отправки сообщения капчи
    if (this.eventBus) {
      this.eventBus.onCaptchaMessageSent(async (event) => {
        await this.updateQuestionId(event.userId, event.messageId)
      })

      // Подписка на события участников: запуск и очистка капчи
      this.eventBus.onMemberJoined(async (evt) => {
        try {
          await this.startChallenge({
            chatId: evt.chatId,
            userId: evt.userId,
            username: evt.username,
            firstName: evt.firstName || "Unknown",
          })
        } catch (e) {
          this.logger.e("Captcha start on member.joined failed:", e)
        }
      })

      this.eventBus.onMemberLeft(async (evt) => {
        try {
          const existing = await this.getRestrictedFromStore(evt.userId)
          if (!existing)
            return

          // Эмитим событие удаления сообщения капчи через существующий механизм
          await this.eventBus!.emitCaptchaFailed({
            chatId: existing.chatId,
            userId: evt.userId,
            username: existing.username,
            firstName: existing.firstName,
            reason: "timeout",
            actions: [
              {
                type: "deleteMessage",
                params: { messageId: existing.questionId },
              },
            ],
          })

          await this.removeRestrictedFromStore(evt.userId)
        } catch (e) {
          this.logger.e("Captcha cleanup on member.left failed:", e)
        }
      })
    }

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

    // Сгенерировать задачу
    const challenge = this.generateCaptcha()

    // Генерируем событие начала капчи (NEW_MEMBER уже есть, но можно добавить CAPTCHA_STARTED)
    // Пока сохраняем состояние с questionId = 0, он будет установлен обработчиком события
    const restricted: RestrictedUser = {
      userId,
      chatId,
      questionId: 0, // Будет установлен обработчиком
      answer: challenge.answer,
      username,
      firstName,
      timestamp: now,
      isAnswered: false,
    }
    await this.saveRestrictedToStore(restricted)

    // Генерируем событие для отправки капчи
    if (this.eventBus) {
      const userMention = username ? `@${username}` : (firstName || getMessage("generic_user"))
      const questionText = `${challenge.question[0]} + ${challenge.question[1]}`
      await this.eventBus.emit("captcha.challenge", {
        chatId,
        userId,
        username,
        firstName,
        question: challenge.question,
        options: challenge.options,
        correctAnswer: challenge.answer,
        actions: [
          {
            type: "sendMessage",
            params: {
              text: getMessage("captcha_welcome", { userMention, question: questionText }),
              inlineKeyboard: challenge.options.map((option: number, index: number) => [{
                text: `${option}`,
                callback_data: `captcha_${userId}_${index}_${option === challenge.answer ? "correct" : "wrong"}`,
              }]),
            },
          },
          {
            type: "restrict",
            params: {
              userId,
              permissions: "none",
            },
          },
        ],
      })
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

    if (computedCorrect) {
      // Генерируем событие успешного прохождения капчи
      if (this.eventBus) {
        await this.eventBus.emitCaptchaPassed({
          chatId: restricted.chatId,
          userId: restricted.userId,
          username: restricted.username,
          firstName: restricted.firstName,
          actions: [
            {
              type: "unrestrict",
              params: {
                userId: restricted.userId,
                permissions: "full",
              },
            },
            {
              type: "deleteMessage",
              params: {
                messageId: restricted.questionId,
              },
            },
          ],
        })
      }
    } else {
      // Генерируем событие неудачного прохождения капчи
      if (this.eventBus) {
        await this.eventBus.emitCaptchaFailed({
          chatId: restricted.chatId,
          userId: restricted.userId,
          username: restricted.username,
          firstName: restricted.firstName,
          reason: "wrong_answer",
          actions: [
            {
              type: "deleteMessage",
              params: {
                messageId: restricted.questionId,
              },
            },
            {
              type: "ban",
              params: {
                userId: restricted.userId,
                userName: restricted.firstName,
                durationSec: 60,
              },
            },
          ],
        })
      }
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
    const user = this.restrictedUsers.get(userId)
    if (user) {
      this.restrictedUsers.delete(userId)
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

      for (const [_userId, user] of this.restrictedUsers) {
        if (!user.isAnswered && (now - user.timestamp) > this.settings.timeoutMs) {
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
    // Генерируем событие таймаута капчи
    if (this.eventBus) {
      void this.eventBus.emitCaptchaFailed({
        chatId: user.chatId,
        userId: user.userId,
        username: user.username,
        firstName: user.firstName,
        reason: "timeout",
        actions: [
          {
            type: "deleteMessage",
            params: {
              messageId: user.questionId,
            },
          },
          {
            type: "ban",
            params: {
              userId: user.userId,
              userName: user.firstName,
              durationSec: this.policy.temporaryBanDurationSec,
            },
          },
        ],
      })
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

  /**
   * Обновление questionId у пользователя после отправки сообщения капчи
   */
  private async updateQuestionId(userId: number, messageId: number): Promise<void> {
    const restricted = await this.getRestrictedFromStore(userId)
    if (!restricted) {
      this.logger.w(`⚠️ Cannot update questionId: user ${userId} not found in store`)
      return
    }

    restricted.questionId = messageId
    await this.saveRestrictedToStore(restricted)
    this.logger.d(`✅ Updated questionId=${messageId} for user ${userId}`)
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
