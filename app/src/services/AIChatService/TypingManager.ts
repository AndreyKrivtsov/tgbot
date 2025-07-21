import type { Logger } from "../../helpers/Logger.js"

/**
 * Интерфейс для управления состоянием typing
 */
export interface TypingState {
  chatId: string
  isActive: boolean
  startTime: number
  timeoutId?: NodeJS.Timeout
}

/**
 * Интерфейс для TypingManager
 */
export interface ITypingManager {
  startTyping: (chatId: string) => void
  stopTyping: (chatId: string) => void
  stopAllTyping: () => void
  isTyping: (chatId: string) => boolean
  getActiveTypingChats: () => string[]
  cleanup: () => void
  getStats: () => object
  dispose: () => void
}

/**
 * Менеджер для управления индикаторами печати
 */
export class TypingManager implements ITypingManager {
  private activeTypingChats: Map<string, TypingState> = new Map()
  private logger: Logger
  private typingTimeoutMs: number = 30000 // 30 секунд максимум
  private typingCallbacks: {
    onStart?: (chatId: string) => void
    onStop?: (chatId: string) => void
  } = {}

  constructor(
    logger: Logger,
    options: {
      typingTimeoutMs?: number
      onStart?: (chatId: string) => void
      onStop?: (chatId: string) => void
    } = {},
  ) {
    this.logger = logger
    this.typingTimeoutMs = options.typingTimeoutMs || 30000
    this.typingCallbacks.onStart = options.onStart
    this.typingCallbacks.onStop = options.onStop
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
    }

    this.activeTypingChats.set(chatId, typingState)

    // Вызываем колбэк
    if (this.typingCallbacks.onStart) {
      try {
        this.typingCallbacks.onStart(chatId)
      } catch (error) {
        this.logger.e(`Error calling onStart callback for chat ${chatId}:`, error)
      }
    }
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

    // Удаляем состояние
    this.activeTypingChats.delete(chatId)

    // Вызываем колбэк
    if (this.typingCallbacks.onStop) {
      try {
        this.typingCallbacks.onStop(chatId)
      } catch (error) {
        this.logger.e(`Error calling onStop callback for chat ${chatId}:`, error)
      }
    }
  }

  /**
   * Проверить, активна ли индикация печати
   */
  isTyping(chatId: string): boolean {
    return this.activeTypingChats.has(chatId)
  }

  /**
   * Получить список чатов с активной индикацией
   */
  getActiveTypingChats(): string[] {
    return Array.from(this.activeTypingChats.keys())
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
   * Очистка устаревших индикаций
   */
  cleanup(): void {
    const now = Date.now()
    const expiredChats: string[] = []

    for (const [chatId, state] of this.activeTypingChats.entries()) {
      if (now - state.startTime > this.typingTimeoutMs) {
        expiredChats.push(chatId)
      }
    }

    if (expiredChats.length > 0) {
      this.logger.d(`Cleaning up ${expiredChats.length} expired typing indicators`)
      for (const chatId of expiredChats) {
        this.stopTyping(chatId)
      }
    }
  }

  /**
   * Получить статистику
   */
  getStats(): object {
    const states = Array.from(this.activeTypingChats.values())
    const now = Date.now()

    return {
      activeChats: states.length,
      averageDuration: states.length > 0
        ? states.reduce((sum, state) => sum + (now - state.startTime), 0) / states.length
        : 0,
      longestDuration: states.length > 0
        ? Math.max(...states.map(state => now - state.startTime))
        : 0,
      serviceStatus: "active",
    }
  }

  /**
   * Получить детальную информацию о состоянии
   */
  getTypingState(chatId: string): TypingState | null {
    return this.activeTypingChats.get(chatId) || null
  }

  /**
   * Обновить таймаут для активной индикации
   */
  refreshTyping(chatId: string): void {
    const state = this.activeTypingChats.get(chatId)
    if (!state) {
      this.logger.d(`No active typing to refresh for chat ${chatId}`)
      return
    }

    // Очищаем старый таймаут
    if (state.timeoutId) {
      clearTimeout(state.timeoutId)
    }

    // Создаем новый таймаут
    const timeoutId = setTimeout(() => {
      this.stopTyping(chatId)
    }, this.typingTimeoutMs)

    // Обновляем состояние
    state.timeoutId = timeoutId
    state.startTime = Date.now()

    this.logger.d(`Refreshed typing indicator for chat ${chatId}`)
  }

  /**
   * Освобождение ресурсов
   */
  dispose(): void {
    this.logger.d("Disposing TypingManager")
    this.stopAllTyping()
  }
}
