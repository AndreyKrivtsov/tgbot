import type { Database } from "../db/database.js"
import type { Group, GroupSettings, NewGroup, NewGroupSettings } from "../db/schema.js"
import type { Logger } from "../helpers/Logger.js"
import type { EventBus } from "./EventBus.js"
import { and, eq } from "drizzle-orm"
import { groupMembers, groups, groupSettings, users } from "../db/schema.js"

export interface GroupManagerOptions {
  database: Database
  logger: Logger
  eventBus: EventBus
}

export class GroupManager {
  private db: Database
  private logger: Logger
  private eventBus: EventBus

  constructor(options: GroupManagerOptions) {
    this.db = options.database
    this.logger = options.logger
    this.eventBus = options.eventBus
  }

  /**
   * Создает новую группу в системе
   */
  async createGroup(groupData: NewGroup, settings?: Partial<NewGroupSettings>): Promise<Group> {
    try {
      const result = await this.db.transaction(async (tx) => {
        // Создаем группу
        const [newGroup] = await tx
          .insert(groups)
          .values(groupData)
          .returning()

        // Создаем настройки по умолчанию
        const defaultSettings: NewGroupSettings = {
          groupId: newGroup.id,
          aiProvider: "openai",
          aiModel: "gpt-4",
          systemPrompt: "Ты полезный AI-ассистент для Telegram группы.",
          ...settings,
        }

        await tx
          .insert(groupSettings)
          .values(defaultSettings)

        return newGroup
      })

      this.logger.i(`Group created: ${result.name} (${result.telegramId})`)
      this.eventBus.emit("group:created", { group: result })

      return result
    }
    catch (error) {
      this.logger.e("Failed to create group:", error)
      throw error
    }
  }

  /**
   * Получает группу по Telegram ID
   */
  async getGroupByTelegramId(telegramId: string): Promise<Group | null> {
    try {
      const [group] = await this.db
        .select()
        .from(groups)
        .where(eq(groups.telegramId, telegramId))
        .limit(1)

      return group || null
    }
    catch (error) {
      this.logger.e("Failed to get group by telegram ID:", error)
      throw error
    }
  }

  /**
   * Получает группу с настройками
   */
  async getGroupWithSettings(groupId: number): Promise<{ group: Group, settings: GroupSettings } | null> {
    try {
      const result = await this.db
        .select()
        .from(groups)
        .leftJoin(groupSettings, eq(groups.id, groupSettings.groupId))
        .where(eq(groups.id, groupId))
        .limit(1)

      if (!result[0]?.groups) {
        return null
      }

      return {
        group: result[0].groups,
        settings: result[0].group_settings!,
      }
    }
    catch (error) {
      this.logger.e("Failed to get group with settings:", error)
      throw error
    }
  }

  /**
   * Обновляет настройки группы
   */
  async updateGroupSettings(groupId: number, settings: Partial<GroupSettings>): Promise<void> {
    try {
      await this.db
        .update(groupSettings)
        .set({
          ...settings,
          updatedAt: new Date(),
        })
        .where(eq(groupSettings.groupId, groupId))

      this.logger.i(`Group settings updated for group ${groupId}`)
      this.eventBus.emit("group:settings_updated", { groupId, settings })
    }
    catch (error) {
      this.logger.e("Failed to update group settings:", error)
      throw error
    }
  }

  /**
   * Проверяет, есть ли пользователь в группе
   */
  async isUserInGroup(groupId: number, userId: number): Promise<boolean> {
    try {
      const [member] = await this.db
        .select()
        .from(groupMembers)
        .where(
          and(
            eq(groupMembers.groupId, groupId),
            eq(groupMembers.userId, userId),
          ),
        )
        .limit(1)

      return !!member
    }
    catch (error) {
      this.logger.e("Failed to check user in group:", error)
      throw error
    }
  }

  /**
   * Добавляет пользователя в группу
   */
  async addUserToGroup(groupId: number, userId: number, role: string = "member"): Promise<void> {
    try {
      await this.db
        .insert(groupMembers)
        .values({
          groupId,
          userId,
          role,
        })
        .onConflictDoNothing()

      this.logger.i(`User ${userId} added to group ${groupId} as ${role}`)
      this.eventBus.emit("group:user_added", { groupId, userId, role })
    }
    catch (error) {
      this.logger.e("Failed to add user to group:", error)
      throw error
    }
  }

  /**
   * Получает все активные группы
   */
  async getActiveGroups(): Promise<Group[]> {
    try {
      return await this.db
        .select()
        .from(groups)
        .where(eq(groups.status, "active"))
    }
    catch (error) {
      this.logger.e("Failed to get active groups:", error)
      throw error
    }
  }

  /**
   * Обновляет статус группы
   */
  async updateGroupStatus(groupId: number, status: string): Promise<void> {
    try {
      await this.db
        .update(groups)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(eq(groups.id, groupId))

      this.logger.i(`Group ${groupId} status updated to ${status}`)
      this.eventBus.emit("group:status_updated", { groupId, status })
    }
    catch (error) {
      this.logger.e("Failed to update group status:", error)
      throw error
    }
  }

  /**
   * Удаляет группу (мягкое удаление)
   */
  async deleteGroup(groupId: number): Promise<void> {
    await this.updateGroupStatus(groupId, "inactive")
  }
}
