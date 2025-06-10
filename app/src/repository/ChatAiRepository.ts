import { eq, sql } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { aiContexts, chats, groupAdmins } from "../db/schema.js"
import type { Chat, GroupAdmin, NewChat } from "../db/schema.js"

export class ChatAiRepository {
  constructor(private db: NodePgDatabase<any>) {}

  /**
   * Получить настройки чата для ИИ
   */
  async getChat(chatId: number): Promise<Chat | null> {
    try {
      const result = await this.db
        .select()
        .from(chats)
        .where(eq(chats.id, chatId))
        .limit(1)

      return result[0] || null
    } catch (error) {
      console.error("Error getting chat:", error)
      return null
    }
  }

  /**
   * Создать чат с настройками ИИ по умолчанию
   */
  async createChat(chatId: number, title?: string, type: string = "group"): Promise<Chat | null> {
    try {
      const result = await this.db
        .insert(chats)
        .values({
          id: chatId,
          type,
          title,
          isAiEnabled: true,
          dailyLimit: 1500,
          throttleDelay: 3000,
          maxContextCharacters: 600,
        })
        .returning()

      return result[0] || null
    } catch (error) {
      console.error("Error creating chat:", error)
      return null
    }
  }

  /**
   * Получить чат или создать с настройками по умолчанию
   */
  async getOrCreateChat(chatId: number, title?: string, type: string = "group"): Promise<Chat | null> {
    let chat = await this.getChat(chatId)

    if (!chat) {
      chat = await this.createChat(chatId, title, type)
    }

    return chat
  }

  /**
   * Обновить настройки чата
   */
  async updateChat(chatId: number, updates: Partial<Omit<NewChat, "id">>): Promise<boolean> {
    try {
      const result = await this.db
        .update(chats)
        .set({
          ...updates,
          updatedAt: new Date(),
        })
        .where(eq(chats.id, chatId))

      return (result.rowCount || 0) > 0
    } catch (error) {
      console.error("Error updating chat:", error)
      return false
    }
  }

  /**
   * Включить/выключить ИИ в чате
   */
  async toggleAi(chatId: number, enabled: boolean): Promise<boolean> {
    return await this.updateChat(chatId, { isAiEnabled: enabled })
  }

  /**
   * Установить API ключ для чата
   */
  async setApiKey(chatId: number, apiKey: string | null): Promise<boolean> {
    return await this.updateChat(chatId, { geminiApiKey: apiKey })
  }

  /**
   * Установить системный промпт
   */
  async setSystemPrompt(chatId: number, prompt: string | null): Promise<boolean> {
    return await this.updateChat(chatId, { systemPrompt: prompt })
  }

  /**
   * Установить максимальную длину контекста в символах
   */
  async setMaxContextCharacters(chatId: number, maxChars: number): Promise<boolean> {
    return await this.updateChat(chatId, { maxContextCharacters: maxChars })
  }

  /**
   * Получить администраторов чата
   */
  async getChatAdmins(chatId: number): Promise<GroupAdmin[]> {
    try {
      return await this.db
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
  async addAdmin(chatId: number, userId: number, role: string = "admin"): Promise<boolean> {
    try {
      await this.db
        .insert(groupAdmins)
        .values({
          groupId: chatId,
          userId,
          role,
        })
        .onConflictDoUpdate({
          target: [groupAdmins.groupId, groupAdmins.userId],
          set: { role },
        })

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
      const result = await this.db
        .delete(groupAdmins)
        .where(
          sql`${groupAdmins.groupId} = ${chatId} AND ${groupAdmins.userId} = ${userId}`,
        )

      return (result.rowCount || 0) > 0
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
      const result = await this.db
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
   * Получить все активные чаты с ИИ
   */
  async getActiveAiChats(): Promise<Chat[]> {
    try {
      return await this.db
        .select()
        .from(chats)
        .where(eq(chats.isAiEnabled, true))
    } catch (error) {
      console.error("Error getting active AI chats:", error)
      return []
    }
  }

  /**
   * Получить контекст чата
   */
  async getContext(chatId: number): Promise<{
    messages: string
    totalRequestCount: number
    dailyRequestCount: number
    contextLength: number
  } | null> {
    try {
      const result = await this.db
        .select()
        .from(aiContexts)
        .where(eq(aiContexts.chatId, chatId))
        .limit(1)

      if (result[0]) {
        return {
          messages: result[0].messages || "",
          totalRequestCount: result[0].totalRequestCount || 0,
          dailyRequestCount: result[0].dailyRequestCount || 0,
          contextLength: result[0].contextLength || 0,
        }
      }

      return null
    } catch (error) {
      console.error("Error getting context:", error)
      return null
    }
  }

  /**
   * Сохранить контекст чата
   */
  async saveContext(chatId: number, messages: string, totalRequests: number, dailyRequests: number): Promise<boolean> {
    try {
      await this.db
        .insert(aiContexts)
        .values({
          chatId,
          messages,
          totalRequestCount: totalRequests,
          dailyRequestCount: dailyRequests,
          contextLength: messages.length,
          lastActivity: new Date(),
        })
        .onConflictDoUpdate({
          target: aiContexts.chatId,
          set: {
            messages,
            totalRequestCount: totalRequests,
            dailyRequestCount: dailyRequests,
            contextLength: messages.length,
            lastActivity: new Date(),
          },
        })

      return true
    } catch (error) {
      console.error("Error saving context:", error)
      return false
    }
  }

  /**
   * Обрезать контекст по максимальной длине
   */
  trimContext(context: string, maxLength: number): string {
    if (context.length <= maxLength) {
      return context
    }

    // Оставляем последние maxLength символов, пытаясь сохранить целостность сообщений
    const trimmed = context.slice(-maxLength)

    // Найдем первый перенос строки, чтобы не обрезать посередине сообщения
    const firstNewLine = trimmed.indexOf("\n")
    if (firstNewLine > 0 && firstNewLine < maxLength * 0.1) {
      return trimmed.slice(firstNewLine + 1)
    }

    return trimmed
  }
}
