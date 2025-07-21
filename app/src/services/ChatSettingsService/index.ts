import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import type { AIChatServiceRefactored } from "../AIChatService/AIChatServiceRefactored.js"
import type { Chat, ChatConfig, SystemPromptData } from "../../db/schema.js"

/**
 * Централизованный сервис для управления настройками чатов
 * Автоматически координирует работу с кешами в разных сервисах
 */
export class ChatSettingsService implements IService {
  private logger: Logger
  private chatRepository: ChatRepository
  private aiChatService?: AIChatServiceRefactored

  constructor(
    logger: Logger,
    chatRepository: ChatRepository,
    aiChatService?: AIChatServiceRefactored,
  ) {
    this.logger = logger
    this.chatRepository = chatRepository
    this.aiChatService = aiChatService
  }

  /**
   * Устанавливает ссылку на AIChatService для синхронизации кешей
   */
  setAIChatService(aiChatService: AIChatServiceRefactored): void {
    this.aiChatService = aiChatService
  }

  async initialize(): Promise<void> {
    this.logger.i("🔧 Initializing ChatSettingsService...")
  }

  async start(): Promise<void> {
    this.logger.i("✅ ChatSettingsService started")
  }

  async stop(): Promise<void> {
    this.logger.i("🛑 ChatSettingsService stopped")
  }

  async dispose(): Promise<void> {
    this.logger.i("🗑️ ChatSettingsService disposed")
  }

  isHealthy(): boolean {
    return true
  }

  // ==========================================================================
  // ЧТЕНИЕ НАСТРОЕК
  // ==========================================================================

  /**
   * Получить настройки чата (чат + конфигурация)
   */
  async getChatSettings(chatId: number): Promise<{ chat: Chat | null, config: ChatConfig | null }> {
    return await this.chatRepository.getChatWithConfig(chatId)
  }

  /**
   * Получить только конфигурацию ИИ для чата
   */
  async getChatConfig(chatId: number): Promise<ChatConfig | null> {
    return await this.chatRepository.getChatConfig(chatId)
  }

  /**
   * Проверить включен ли ИИ в чате
   */
  async isAiEnabled(chatId: number): Promise<boolean> {
    const config = await this.getChatConfig(chatId)
    return config?.aiEnabled ?? true
  }

  /**
   * Получить API ключ для чата
   */
  async getApiKey(chatId: number): Promise<string | null> {
    const config = await this.getChatConfig(chatId)
    return config?.geminiApiKey || null
  }

  /**
   * Получить системный промпт для чата
   */
  async getSystemPrompt(chatId: number): Promise<SystemPromptData | null> {
    const config = await this.getChatConfig(chatId)
    return config?.systemPrompt || null
  }

  // ==========================================================================
  // ИЗМЕНЕНИЕ НАСТРОЕК С АВТОМАТИЧЕСКОЙ ОЧИСТКОЙ КЕШЕЙ
  // ==========================================================================

  /**
   * Включить/выключить ИИ в чате
   */
  async toggleAi(chatId: number, enabled: boolean): Promise<boolean> {
    const success = await this.chatRepository.toggleAi(chatId, enabled)

    if (success) {
      this.invalidateAllCaches(chatId)
      this.logger.i(`AI ${enabled ? "enabled" : "disabled"} for chat ${chatId}`)
    }

    return success
  }

  /**
   * Установить API ключ для чата
   */
  async setApiKey(chatId: number, apiKey: string | null): Promise<boolean> {
    const success = await this.chatRepository.setApiKey(chatId, apiKey)

    if (success) {
      this.invalidateAllCaches(chatId)
      const maskedKey = apiKey ? `${apiKey.substring(0, 8)}...${apiKey.slice(-4)}` : "null"
      this.logger.i(`API key updated for chat ${chatId}: ${maskedKey}`)
    }

    return success
  }

  /**
   * Установить системный промпт для чата
   */
  async setSystemPrompt(chatId: number, promptData: SystemPromptData | null): Promise<boolean> {
    const success = await this.chatRepository.setSystemPrompt(chatId, promptData)

    if (success) {
      this.invalidateAllCaches(chatId)
      this.logger.i(`System prompt updated for chat ${chatId}`)
    }

    return success
  }

  /**
   * Обновить несколько настроек одновременно
   */
  async updateSettings(
    chatId: number,
    updates: Partial<{
      aiEnabled: boolean
      geminiApiKey: string | null
      systemPrompt: SystemPromptData | null
    }>,
  ): Promise<boolean> {
    const success = await this.chatRepository.updateChatConfig(chatId, updates)

    if (success) {
      this.invalidateAllCaches(chatId)
      this.logger.i(`Settings updated for chat ${chatId}:`, Object.keys(updates))
    }

    return success
  }

  // ==========================================================================
  // УПРАВЛЕНИЕ КЕШАМИ
  // ==========================================================================

  /**
   * Очистить все кеши для конкретного чата
   */
  private invalidateAllCaches(chatId: number): void {
    // Очищаем кеш в ChatRepository (встроенный)
    // (вызывается автоматически при updateChatConfig)

    // Очищаем кеш в AIChatService
    this.aiChatService?.clearChatCache(chatId)

    this.logger.d(`🔄 All caches cleared for chat ${chatId}`)
  }

  /**
   * Принудительно очистить кеш для чата (публичный метод)
   */
  async clearChatCache(chatId: number): Promise<void> {
    this.invalidateAllCaches(chatId)
  }

  // ==========================================================================
  // ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ==========================================================================

  /**
   * Создать чат и конфигурацию если их нет
   */
  async ensureChatExists(chatId: number, title?: string, type: string = "group"): Promise<boolean> {
    try {
      const result = await this.chatRepository.getOrCreateChat(chatId, title, type)
      return result !== null
    } catch (error) {
      this.logger.e(`Error ensuring chat exists ${chatId}:`, error)
      return false
    }
  }

  /**
   * Проверить является ли пользователь администратором чата
   */
  async isAdmin(chatId: number, userId: number): Promise<boolean> {
    return await this.chatRepository.isAdmin(chatId, userId)
  }

  /**
   * Получить статистику настроек
   */
  getStats(): object {
    return {
      service: "ChatSettingsService",
      status: "active",
    }
  }
}
