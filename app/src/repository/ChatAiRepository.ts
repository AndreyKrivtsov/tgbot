import { eq, sql } from "drizzle-orm"
import { chatConfigs, chats, groupAdmins } from "../db/schema.js"
import type { Chat, ChatConfig, GroupAdmin, NewChat, NewChatConfig, SystemPromptData } from "../db/schema.js"
import type { DatabaseService } from "../services/DatabaseService/index.js"
import type { CacheService } from "../services/CacheService/index.js"
import { CACHE_CONFIG } from "../constants.js"

export class ChatAiRepository {
  private databaseService: DatabaseService
  private cacheService?: CacheService

  constructor(databaseService: DatabaseService, cacheService?: CacheService) {
    this.databaseService = databaseService
    this.cacheService = cacheService
  }

  /**
   * Получить экземпляр базы данных
   */
  private getDb() {
    return this.databaseService.getDb()
  }

  /**
   * Получить базовую информацию о чате
   */
  async getChat(chatId: number): Promise<Chat | null> {
    const cacheKey = `${CACHE_CONFIG.KEYS.CHAT}:${chatId}`

    // Пытаемся получить из кеша
    if (this.cacheService) {
      const cached = this.cacheService.get(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    try {
      const db = this.getDb()
      const result = await db
        .select()
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1)

      const chat = result[0] || null

      // Сохраняем в кеш
      if (this.cacheService && chat) {
        this.cacheService.set(cacheKey, chat, CACHE_CONFIG.CHAT_TTL_SECONDS)
      }

      return chat
    } catch (error) {
      console.error("Error getting chat:", error)
      return null
    }
  }

  /**
   * Получить конфигурацию ИИ для чата
   */
  async getChatConfig(chatId: number): Promise<ChatConfig | null> {
    const cacheKey = `${CACHE_CONFIG.KEYS.CHAT_CONFIG}:${chatId}`

    // Пытаемся получить из кеша
    if (this.cacheService) {
      const cached = this.cacheService.get(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    try {
      const db = this.getDb()
      const result = await db
        .select()
        .from(chatConfigs)
        .where(eq(chatConfigs.chatId, chatId))
        .limit(1)

      const config = result[0] || null

      // Сохраняем в кеш
      if (this.cacheService && config) {
        this.cacheService.set(cacheKey, config, CACHE_CONFIG.CHAT_CONFIG_TTL_SECONDS)
      }

      return config
    } catch (error) {
      console.error("Error getting chat config:", error)
      return null
    }
  }

  /**
   * Получить полную информацию о чате с конфигурацией
   */
  async getChatWithConfig(chatId: number): Promise<{
    chat: Chat | null
    config: ChatConfig | null
  }> {
    try {
      const chat = await this.getChat(chatId)
      const config = await this.getChatConfig(chatId)

      return { chat, config }
    } catch (error) {
      console.error("Error getting chat with config:", error)
      return { chat: null, config: null }
    }
  }

  /**
   * Создать чат с базовой информацией
   */
  async createChat(chatId: number, title?: string, type: string = "group"): Promise<Chat | null> {
    try {
      const db = this.getDb()
      const result = await db
        .insert(chats)
        .values({
          id: chatId,
          type,
          title,
        })
        .returning()

      const chat = result[0] || null

      // Очищаем кеш после создания
      if (chat) {
        this.invalidateCache(chatId)
      }

      return chat
    } catch (error) {
      console.error("Error creating chat:", error)
      return null
    }
  }

  /**
   * Создать конфигурацию ИИ для чата
   */
  async createChatConfig(chatId: number, config?: Partial<Omit<NewChatConfig, "chatId">>): Promise<ChatConfig | null> {
    try {
      const db = this.getDb()
      const result = await db
        .insert(chatConfigs)
        .values({
          chatId,
          ...config,
        })
        .returning()

      return result[0] || null
    } catch (error) {
      console.error("Error creating chat config:", error)
      return null
    }
  }

  /**
   * Получить чат или создать с настройками по умолчанию
   */
  async getOrCreateChat(chatId: number, title?: string, type: string = "group"): Promise<{
    chat: Chat
    config: ChatConfig
  } | null> {
    try {
      let chat = await this.getChat(chatId)
      let config = await this.getChatConfig(chatId)

      // Создаем чат если его нет
      if (!chat) {
        chat = await this.createChat(chatId, title, type)
        if (!chat)
          return null
      }

      // Создаем конфигурацию если её нет
      if (!config) {
        config = await this.createChatConfig(chatId)
        if (!config)
          return null
      }

      return { chat, config }
    } catch (error) {
      console.error("Error getting or creating chat:", error)
      return null
    }
  }

  /**
   * Очистить кеш для чата
   */
  private invalidateCache(chatId: number): void {
    if (this.cacheService) {
      this.cacheService.delete(`${CACHE_CONFIG.KEYS.CHAT}:${chatId}`)
      this.cacheService.delete(`${CACHE_CONFIG.KEYS.CHAT_CONFIG}:${chatId}`)
    }
  }

  /**
   * Обновить базовую информацию о чате
   */
  async updateChat(chatId: number, updates: Partial<Omit<NewChat, "id">>): Promise<boolean> {
    try {
      const db = this.getDb()
      const result = await db
        .update(chats)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(chats.id, chatId))

      const success = (result.count || 0) > 0

      // Очищаем кеш при успешном обновлении
      if (success) {
        this.invalidateCache(chatId)
      }

      return success
    } catch (error) {
      console.error(`Error updating chat ${chatId}:`, error)
      return false
    }
  }

  /**
   * Обновить конфигурацию ИИ для чата
   */
  async updateChatConfig(chatId: number, updates: Partial<Omit<NewChatConfig, "chatId">>): Promise<boolean> {
    try {
      const db = this.getDb()
      const result = await db
        .update(chatConfigs)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(chatConfigs.chatId, chatId))

      const success = (result.count || 0) > 0

      // Очищаем кеш конфигурации при успешном обновлении
      if (success && this.cacheService) {
        this.cacheService.delete(`${CACHE_CONFIG.KEYS.CHAT_CONFIG}:${chatId}`)
      }

      return success
    } catch (error) {
      console.error("Error updating chat config:", error)
      return false
    }
  }

  /**
   * Включить/выключить ИИ в чате
   */
  async toggleAi(chatId: number, enabled: boolean): Promise<boolean> {
    return await this.updateChatConfig(chatId, { aiEnabled: enabled })
  }

  /**
   * Установить API ключ для чата
   */
  async setApiKey(chatId: number, apiKey: string | null): Promise<boolean> {
    return await this.updateChatConfig(chatId, { geminiApiKey: apiKey })
  }

  /**
   * Установить системный промпт для чата
   */
  async setSystemPrompt(chatId: number, promptData: SystemPromptData | null): Promise<boolean> {
    return await this.updateChatConfig(chatId, { systemPrompt: promptData })
  }

  /**
   * Установить задержку между запросами
   */
  async setThrottleDelay(chatId: number, delay: number): Promise<boolean> {
    return await this.updateChatConfig(chatId, { throttleDelay: delay })
  }

  /**
   * Получить системный промпт как строку
   */
  buildSystemPromptString(promptData: SystemPromptData | null): string | null {
    if (!promptData)
      return null

    const parts: string[] = []

    if (promptData["основные правила"]) {
      parts.push(`Основные правила: ${promptData["основные правила"]}`)
    }

    if (promptData["характер"]) {
      parts.push(`Характер: ${promptData["характер"]}`)
    }

    if (promptData["пол"]) {
      parts.push(`Пол: ${promptData["пол"]}`)
    }

    return parts.length > 0 ? `${parts.join(". ")}.` : null
  }

  /**
   * Получить администраторов чата
   */
  async getChatAdmins(chatId: number): Promise<GroupAdmin[]> {
    try {
      return await this.getDb()
        .select()
        .from(groupAdmins)
        .where(eq(groupAdmins.groupId, chatId))
    } catch (error) {
      console.error("Error getting chat admins:", error)
      return []
    }
  }

  /**
   * Добавить администратора чата
   */
  async addAdmin(chatId: number, userId: number): Promise<boolean> {
    try {
      await this.getDb()
        .insert(groupAdmins)
        .values({
          groupId: chatId,
          userId,
        })
        .onConflictDoNothing()

      return true
    } catch (error) {
      console.error("Error adding admin:", error)
      return false
    }
  }

  /**
   * Удалить администратора чата
   */
  async removeAdmin(chatId: number, userId: number): Promise<boolean> {
    try {
      const result = await this.getDb()
        .delete(groupAdmins)
        .where(
          sql`${groupAdmins.groupId} = ${chatId} AND ${groupAdmins.userId} = ${userId}`,
        )

      return (result.count || 0) > 0
    } catch (error) {
      console.error("Error removing admin:", error)
      return false
    }
  }

  /**
   * Проверить, является ли пользователь администратором чата
   */
  async isAdmin(chatId: number, userId: number): Promise<boolean> {
    try {
      const result = await this.getDb()
        .select({ id: groupAdmins.userId })
        .from(groupAdmins)
        .where(
          sql`${groupAdmins.groupId} = ${chatId} AND ${groupAdmins.userId} = ${userId}`,
        )
        .limit(1)

      return result.length > 0
    } catch (error) {
      console.error("Error checking admin status:", error)
      return false
    }
  }

  /**
   * Проверить, существует ли чат в базе данных
   */
  async chatExists(chatId: number): Promise<boolean> {
    try {
      const chat = await this.getChat(chatId)
      return chat !== null
    } catch (error) {
      console.error("Error checking if chat exists:", error)
      return false
    }
  }

  /**
   * Проверить, является ли чат активным
   */
  async isChatActive(chatId: number): Promise<boolean> {
    try {
      const chat = await this.getChat(chatId)
      return chat !== null && chat.active === true
    } catch (error) {
      console.error("Error checking if chat is active:", error)
      return false
    }
  }

  /**
   * Получить все активные чаты с ИИ
   */
  async getActiveAiChats(): Promise<Array<Chat & { config?: ChatConfig }>> {
    try {
      const result = await this.getDb()
        .select()
        .from(chats)
        .leftJoin(chatConfigs, eq(chats.id, chatConfigs.chatId))
        .where(eq(chats.active, true))

      return result.map(row => ({
        ...row.chats,
        config: row.chat_configs || undefined,
      }))
    } catch (error) {
      console.error("Error getting active AI chats:", error)
      return []
    }
  }

  /**
   * Деактивировать чат (мягкое удаление)
   */
  async deactivateChat(chatId: number): Promise<boolean> {
    try {
      const result = await this.updateChat(chatId, { active: false })
      return result
    } catch (error) {
      console.error(`Error deactivating chat ${chatId}:`, error)
      return false
    }
  }

  /**
   * Активировать чат
   */
  async activateChat(chatId: number): Promise<boolean> {
    try {
      const result = await this.updateChat(chatId, { active: true })
      return result
    } catch (error) {
      console.error("Error activating chat:", error)
      return false
    }
  }

  /**
   * Удалить чат и все связанные данные (физическое удаление)
   */
  async deleteChat(chatId: number): Promise<boolean> {
    try {
      const db = this.getDb()

      // Удаляем в транзакции
      await db.transaction(async (tx) => {
        // Удаляем администраторов
        await tx.delete(groupAdmins).where(eq(groupAdmins.groupId, chatId))

        // Удаляем конфигурацию
        await tx.delete(chatConfigs).where(eq(chatConfigs.chatId, chatId))

        // Удаляем сам чат
        await tx.delete(chats).where(eq(chats.id, chatId))
      })

      // Очищаем кеш после удаления
      this.invalidateCache(chatId)

      return true
    } catch (error) {
      console.error("Error deleting chat:", error)
      return false
    }
  }
}
