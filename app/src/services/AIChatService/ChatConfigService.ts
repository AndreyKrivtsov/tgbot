import type { Chat, ChatConfig, SystemPromptData } from "../../db/schema.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import type { Logger } from "../../helpers/Logger.js"
import { AI_CHAT_CONFIG } from "../../constants.js"

/**
 * Интерфейс для результата получения настроек чата
 */
export interface ChatSettingsResult {
  chat: Chat | null
  config: ChatConfig | null
}

/**
 * Интерфейс для результата получения API ключа
 */
export interface ApiKeyResult {
  key: string
  isReal: boolean
}

/**
 * Интерфейс для обновления настроек чата
 */
export interface ChatSettingsUpdates {
  geminiApiKey?: string | null
  systemPrompt?: SystemPromptData | null
  aiEnabled?: boolean
}

/**
 * Интерфейс для ChatConfigService
 */
export interface IChatConfigService {
  getChatSettings: (chatId: number) => Promise<ChatSettingsResult>
  getApiKeyForChat: (chatId: number) => Promise<ApiKeyResult | null>
  getSystemPromptForChat: (chatId: number) => Promise<string>
  isAiEnabledForChat: (chatId: number) => Promise<boolean>
  isChatAdmin: (chatId: number, userId: number) => Promise<boolean>
  updateChatSettings: (chatId: number, userId: number, updates: ChatSettingsUpdates) => Promise<boolean>
  clearChatCache: (chatId: number) => void
  loadAllChatSettings: () => Promise<void>
}

/**
 * Сервис для управления настройками чатов
 */
export class ChatConfigService implements IChatConfigService {
  private chatSettings: Map<number, ChatSettingsResult> = new Map()
  private logger: Logger
  private chatRepository?: ChatRepository

  constructor(
    logger: Logger,
    chatRepository?: ChatRepository,
  ) {
    this.logger = logger
    this.chatRepository = chatRepository
  }

  /**
   * Получить настройки чата
   */
  async getChatSettings(chatId: number): Promise<ChatSettingsResult> {
    // Сначала проверяем кэш
    if (this.chatSettings.has(chatId)) {
      const cached = this.chatSettings.get(chatId)!
      return { chat: cached.chat, config: cached.config }
    }

    // Загружаем из БД
    if (this.chatRepository) {
      const result = await this.chatRepository.getChatWithConfig(chatId)

      if (result.chat) {
        // Извлекаем config из chat.config если он там есть
        const config = result.config || (result.chat as any).config || null
        const normalizedResult = {
          chat: result.chat,
          config,
        }

        // Кешируем нормализованный результат
        this.chatSettings.set(chatId, normalizedResult)
        return normalizedResult
      }
    }

    return { chat: null, config: null }
  }

  /**
   * Получить API ключ для чата (или вернуть null если отсутствует)
   */
  async getApiKeyForChat(chatId: number): Promise<ApiKeyResult | null> {
    const { chat, config } = await this.getChatSettings(chatId)

    this.logger.d(`[ChatConfigService] getApiKeyForChat: chatId=${chatId}, hasGeminiKey=${!!config?.geminiApiKey}`)

    // Если чат приватный — бот не должен работать
    if (chat?.type === "private") {
      this.logger.w(`ChatConfigService: попытка работы в приватном чате ${chatId} — запрещено.`)
      return null
    }

    // Если есть настоящий API ключ в конфиге чата, используем его
    if (config?.geminiApiKey) {
      const maskedKey = `${config.geminiApiKey.substring(0, 8)}...${config.geminiApiKey.slice(-4)}`
      this.logger.d(`[ChatConfigService] Найден ключ для чата ${chatId}: ${maskedKey}`)
      return {
        key: config.geminiApiKey,
        isReal: true,
      }
    }

    this.logger.d(`[ChatConfigService] Ключ для чата ${chatId} не найден!`)
    // API ключ отсутствует
    return null
  }

  /**
   * Получить системный промпт для чата
   */
  async getSystemPromptForChat(chatId: number): Promise<string> {
    const { config } = await this.getChatSettings(chatId)

    // Если есть кастомный системный промпт в конфигурации чата, используем его
    if (config?.systemPrompt) {
      return this.chatRepository?.buildSystemPromptString(config.systemPrompt) || AI_CHAT_CONFIG.DEFAULT_SYSTEM_PROMPT
    }

    // Иначе возвращаем дефолтный системный промпт
    return AI_CHAT_CONFIG.DEFAULT_SYSTEM_PROMPT
  }

  /**
   * Проверить включен ли ИИ в чате
   */
  async isAiEnabledForChat(chatId: number): Promise<boolean> {
    const { config } = await this.getChatSettings(chatId)
    return config?.aiEnabled ?? true
  }

  /**
   * Проверить является ли пользователь администратором чата
   */
  async isChatAdmin(chatId: number, userId: number): Promise<boolean> {
    if (!this.chatRepository)
      return false
    return await this.chatRepository.isAdmin(chatId, userId)
  }

  /**
   * Обновить настройки чата (только для администраторов)
   */
  async updateChatSettings(
    chatId: number,
    userId: number,
    updates: ChatSettingsUpdates,
  ): Promise<boolean> {
    if (!this.chatRepository)
      return false

    // Проверяем права администратора
    const isAdmin = await this.isChatAdmin(chatId, userId)
    if (!isAdmin) {
      this.logger.w(`User ${userId} tried to update settings for chat ${chatId} without admin rights`)
      return false
    }

    const success = await this.chatRepository.updateChatConfig(chatId, updates)
    if (success) {
      // Обновляем кэш
      this.chatSettings.delete(chatId)
      this.logger.i(`Chat ${chatId} settings updated by user ${userId}`)
      // Принудительно обновляем кэш для этого чата
      await this.getChatSettings(chatId)
    }

    return success
  }

  /**
   * Очистить кэш настроек для конкретного чата
   */
  clearChatCache(chatId: number): void {
    this.logger.d(`🔄 Cache cleared for chat ${chatId}`)
    this.chatSettings.delete(chatId)
  }

  /**
   * Загрузить все настройки чатов из БД
   */
  async loadAllChatSettings(): Promise<void> {
    if (!this.chatRepository) {
      this.logger.w("ChatRepository not available, skipping chat settings loading")
      return
    }

    try {
      // Здесь может быть логика загрузки всех настроек если нужно
      // Пока оставляем пустым, так как загрузка происходит по требованию
      this.logger.i("Chat settings service initialized")
    } catch (error) {
      this.logger.e("Error loading chat settings:", error)
    }
  }
}
