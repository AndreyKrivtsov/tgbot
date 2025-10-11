import type { Logger } from "../../helpers/Logger.js"
/**
 * Интерфейс для управления состоянием typing
 */
export interface TypingState {
  chatId: string
  isActive: boolean
  startTime: number
  timeoutId?: NodeJS.Timeout
  intervalId?: NodeJS.Timeout
}

/**
 * Интерфейс для TypingManager (упрощенный, только используемые методы)
 */
export interface ITypingManager {
  startTyping: (chatId: string) => void
  stopTyping: (chatId: string) => void
  stopAllTyping: () => void
  dispose: () => void
}

/**
 * Менеджер для управления индикаторами печати
 */
export class TypingManager implements ITypingManager {
  private activeTypingChats: Map<string, TypingState> = new Map()
  private logger: Logger
  private typingTimeoutMs: number = 30000 // 30 секунд максимум
  private sendTypingAction: (chatId: number) => Promise<void>

  constructor(
    logger: Logger,
    sendTypingAction: (chatId: number) => Promise<void>,
    options: {
      typingTimeoutMs?: number
    } = {},
  ) {
    this.logger = logger
    this.sendTypingAction = sendTypingAction
    this.typingTimeoutMs = options.typingTimeoutMs || 300 * 1000
  }

  /**
   * Начать индикацию печати
   */
  startTyping(chatId: string): void {
    // Если уже активен, не делаем ничего
    if (this.activeTypingChats.has(chatId)) {
      this.logger.d(`Typing already active for chat ${chatId}`)
      return
    }

    this.logger.d(`Starting typing indicator for chat ${chatId}`)

    // Отправляем typing сразу
    this.sendTypingActionSafe(Number.parseInt(chatId))

    // Создаем интервал для повторной отправки каждые 4 секунды
    const intervalId = setInterval(() => {
      this.sendTypingActionSafe(Number.parseInt(chatId))
    }, 4000)

    // Создаем таймаут для автоматической остановки
    const timeoutId = setTimeout(() => {
      this.stopTyping(chatId)
    }, this.typingTimeoutMs)

    // Сохраняем состояние
    const typingState: TypingState = {
      chatId,
      isActive: true,
      startTime: Date.now(),
      timeoutId,
      intervalId,
    }

    this.activeTypingChats.set(chatId, typingState)
  }

  /**
   * Остановить индикацию печати
   */
  stopTyping(chatId: string): void {
    const typingState = this.activeTypingChats.get(chatId)
    if (!typingState) {
      this.logger.d(`No active typing for chat ${chatId}`)
      return
    }

    this.logger.d(`Stopping typing indicator for chat ${chatId}`)

    // Очищаем таймаут
    if (typingState.timeoutId) {
      clearTimeout(typingState.timeoutId)
    }

    // Очищаем интервал
    if (typingState.intervalId) {
      clearInterval(typingState.intervalId)
    }

    // Удаляем состояние
    this.activeTypingChats.delete(chatId)
  }

  /**
   * Безопасная отправка typing action с обработкой ошибок
   */
  private async sendTypingActionSafe(chatId: number): Promise<void> {
    try {
      await this.sendTypingAction(chatId)
    } catch (error) {
      this.logger.e(`Error sending typing action for chat ${chatId}:`, error)
    }
  }

  /**
   * Принудительно остановить все индикации
   */
  stopAllTyping(): void {
    const chatIds = Array.from(this.activeTypingChats.keys())
    this.logger.d(`Stopping all typing indicators for ${chatIds.length} chats`)

    for (const chatId of chatIds) {
      this.stopTyping(chatId)
    }
  }

  /**
   * Освобождение ресурсов
   */
  dispose(): void {
    this.logger.d("Disposing TypingManager")
    this.stopAllTyping()
  }
}
