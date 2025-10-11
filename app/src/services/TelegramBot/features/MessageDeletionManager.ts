import type { IService } from "../../../core/Container.js"
import type { Logger } from "../../../helpers/Logger.js"
import type { RedisService } from "../../RedisService/index.js"
import type { DeletionTask, TelegramBot } from "../types/index.js"
import { BOT_CONFIG } from "../../../constants.js"

/**
 * Менеджер автоудаления сообщений с поддержкой персистентности и retry логики
 *
 * Особенности:
 * - Хранение в памяти + Redis для персистентности
 * - Одна повторная попытка при неудаче
 * - Автоматическое восстановление задач при перезапуске
 * - Подробное логирование всех операций
 */
export class MessageDeletionManager implements IService {
  private pendingDeletions = new Map<number, DeletionTask>()
  private processingTimer?: NodeJS.Timeout
  private isRunning = false

  constructor(
    private redisService: RedisService,
    private logger: Logger,
    private bot?: TelegramBot,
  ) {}

  /**
   * Установка экземпляра бота после его создания
   */
  setBot(bot: TelegramBot): void {
    this.bot = bot
  }

  /**
   * Запланировать удаление сообщения
   */
  async scheduleDeletion(chatId: number, messageId: number, deleteAfterMs: number): Promise<void> {
    const task: DeletionTask = {
      messageId,
      chatId,
      deleteAt: Date.now() + deleteAfterMs,
      retryCount: 0,
    }

    try {
      // Сохраняем в память И в Redis
      this.pendingDeletions.set(messageId, task)
      await this.redisService.set(`deletion:${messageId}`, task, BOT_CONFIG.MESSAGE_DELETION_REDIS_TTL_SEC)

      this.logger.d(`📅 Scheduled deletion for message ${messageId} in ${deleteAfterMs}ms (chat: ${chatId})`)
    } catch (error) {
      this.logger.e(`❌ Failed to schedule deletion for message ${messageId}:`, error)
      // Убираем из памяти при ошибке сохранения в Redis
      this.pendingDeletions.delete(messageId)
      throw error
    }
  }

  /**
   * Инициализация сервиса
   */
  async initialize(): Promise<void> {
    this.logger.i("🚀 Initializing MessageDeletionManager...")

    await this.loadPendingTasks()
    this.startProcessing()

    this.isRunning = true
    this.logger.i(`✅ MessageDeletionManager started with ${this.pendingDeletions.size} pending tasks`)
  }

  /**
   * Запуск сервиса (alias для initialize)
   */
  async start(): Promise<void> {
    await this.initialize()
  }

  /**
   * Остановка сервиса
   */
  async stop(): Promise<void> {
    if (this.processingTimer) {
      clearInterval(this.processingTimer)
      this.processingTimer = undefined
    }

    this.isRunning = false
    this.logger.i(`🛑 MessageDeletionManager stopped (${this.pendingDeletions.size} tasks pending)`)
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    await this.stop()
    this.pendingDeletions.clear()
    this.logger.i("🗑️ MessageDeletionManager disposed")
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return this.isRunning && this.processingTimer !== undefined
  }

  /**
   * Загрузка задач из Redis при старте
   */
  private async loadPendingTasks(): Promise<void> {
    try {
      const keys = await this.redisService.keys("deletion:*")
      let loaded = 0
      let expired = 0
      const now = Date.now()

      for (const key of keys) {
        const task = await this.redisService.get<DeletionTask>(key)
        if (task && task.messageId) {
          // Проверяем, не просрочена ли задача более чем на установленное время
          if (task.deleteAt < now - BOT_CONFIG.MESSAGE_DELETION_CLEANUP_MAX_AGE_MS) {
            // Удаляем старые просроченные задачи
            await this.redisService.del(key)
            expired++
          } else {
            this.pendingDeletions.set(task.messageId, task)
            loaded++
          }
        } else {
          // Удаляем некорректные записи
          await this.redisService.del(key)
        }
      }

      if (loaded > 0) {
        this.logger.i(`📂 Loaded ${loaded} pending deletion tasks from Redis`)
      }
      if (expired > 0) {
        this.logger.i(`🧹 Cleaned up ${expired} expired tasks from Redis`)
      }
    } catch (error) {
      this.logger.e("❌ Failed to load pending tasks from Redis:", error)
      // Не критично - продолжаем работу с пустым состоянием
    }
  }

  /**
   * Запуск обработки задач
   */
  private startProcessing(): void {
    this.processingTimer = setInterval(() => {
      this.processExpiredTasks().catch((error) => {
        this.logger.e("❌ Error in deletion processing:", error)
      })
    }, BOT_CONFIG.MESSAGE_DELETION_CHECK_INTERVAL_MS)
  }

  /**
   * Обработка просроченных задач
   */
  private async processExpiredTasks(): Promise<void> {
    if (this.pendingDeletions.size === 0) {
      return // Нет задач для обработки
    }

    const now = Date.now()
    const expiredTasks: DeletionTask[] = []

    // Находим просроченные задачи
    for (const task of this.pendingDeletions.values()) {
      if (task.deleteAt <= now) {
        expiredTasks.push(task)
      }
    }

    if (expiredTasks.length === 0) {
      return // Нет просроченных задач
    }

    this.logger.d(`⏰ Processing ${expiredTasks.length} expired deletion tasks`)

    // Обрабатываем каждую задачу
    for (const task of expiredTasks) {
      await this.executeTask(task)
    }
  }

  /**
   * Выполнение задачи удаления
   */
  private async executeTask(task: DeletionTask): Promise<void> {
    try {
      if (!this.bot) {
        throw new Error("Telegram bot is not set in MessageDeletionManager")
      }
      await this.bot.deleteMessage(task.chatId, task.messageId)

      // Успешно удалили - убираем из памяти и Redis
      this.pendingDeletions.delete(task.messageId)
      await this.redisService.del(`deletion:${task.messageId}`)

      this.logger.i(`✅ Message ${task.messageId} deleted successfully from chat ${task.chatId}`)
    } catch (error) {
      this.logger.e(`❌ Failed to delete message ${task.messageId} from chat ${task.chatId}:`, error)

      // Повторная попытка?
      if (task.retryCount === 0) {
        task.retryCount = 1
        task.deleteAt = Date.now() + BOT_CONFIG.MESSAGE_DELETION_RETRY_DELAY_MS

        try {
          // Обновляем в Redis
          await this.redisService.set(`deletion:${task.messageId}`, task, BOT_CONFIG.MESSAGE_DELETION_REDIS_TTL_SEC)
          this.logger.w(`🔄 Scheduled retry for message ${task.messageId} in ${BOT_CONFIG.MESSAGE_DELETION_RETRY_DELAY_MS / 1000} seconds`)
        } catch (redisError) {
          this.logger.e(`❌ Failed to save retry task to Redis:`, redisError)
          // Продолжаем работу только с памятью
        }
      } else {
        // Финальная неудача - убираем задачу
        this.pendingDeletions.delete(task.messageId)

        try {
          await this.redisService.del(`deletion:${task.messageId}`)
        } catch (redisError) {
          this.logger.w(`⚠️ Failed to clean up task from Redis:`, redisError)
        }

        this.logger.e(`💀 Final failure to delete message ${task.messageId} after retry. Giving up.`)
      }
    }
  }

  /**
   * Получение количества ожидающих задач (для отладки)
   */
  getPendingCount(): number {
    return this.pendingDeletions.size
  }

  /**
   * Получение информации о сервисе
   */
  async getServiceInfo(): Promise<object> {
    const now = Date.now()
    let pendingCount = 0
    let overdueCount = 0

    for (const task of this.pendingDeletions.values()) {
      if (task.deleteAt > now) {
        pendingCount++
      } else {
        overdueCount++
      }
    }

    return {
      name: "MessageDeletionManager",
      isRunning: this.isRunning,
      isHealthy: this.isHealthy(),
      totalTasks: this.pendingDeletions.size,
      pendingTasks: pendingCount,
      overdueTasks: overdueCount,
      memoryUsageKb: Math.round(this.pendingDeletions.size * 0.04), // примерная оценка
      config: {
        checkIntervalMs: BOT_CONFIG.MESSAGE_DELETION_CHECK_INTERVAL_MS,
        retryDelayMs: BOT_CONFIG.MESSAGE_DELETION_RETRY_DELAY_MS,
        redisTtlSec: BOT_CONFIG.MESSAGE_DELETION_REDIS_TTL_SEC,
      },
    }
  }
}
