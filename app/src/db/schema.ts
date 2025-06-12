import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core"

/**
 * Чаты с базовой информацией
 */
export const chats = pgTable("chats", {
  id: bigint("id", { mode: "number" }).primaryKey(), // Telegram chat ID
  type: varchar("type", { length: 50 }).notNull(), // 'private', 'group', 'supergroup'
  title: varchar("title", { length: 255 }),
  active: boolean("active").default(true), // Активен ли чат
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => ({
  typeIdx: index("idx_chats_type").on(table.type),
  activeIdx: index("idx_chats_active").on(table.active),
}))

/**
 * Конфигурация ИИ для чатов
 */
export const chatConfigs = pgTable("chat_configs", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(), // Ссылка на chat.id
  geminiApiKey: varchar("gemini_api_key", { length: 512 }), // API ключ для Gemini
  systemPrompt: jsonb("system_prompt").$type<{
    "основные правила"?: string
    "характер"?: string
    "пол"?: string
  }>(), // Системный промпт в формате JSON
  aiEnabled: boolean("ai_enabled").default(true), // Включен ли ИИ в чате
  throttleDelay: integer("throttle_delay").default(3000), // Задержка между запросами в мс
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => ({
  aiEnabledIdx: index("idx_chat_configs_ai_enabled").on(table.aiEnabled),
}))

/**
 * Администраторы групп
 */
export const groupAdmins = pgTable("group_admins", {
  groupId: bigint("group_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, table => ({
  pk: primaryKey({ columns: [table.groupId, table.userId] }),
  groupIdx: index("idx_group_admins_group").on(table.groupId),
  userIdx: index("idx_group_admins_user").on(table.userId),
}))

/**
 * Типы данных для TypeScript
 */
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert

export type ChatConfig = typeof chatConfigs.$inferSelect
export type NewChatConfig = typeof chatConfigs.$inferInsert

export type GroupAdmin = typeof groupAdmins.$inferSelect
export type NewGroupAdmin = typeof groupAdmins.$inferInsert

/**
 * Тип для системного промпта
 */
export interface SystemPromptData {
  "основные правила"?: string
  "характер"?: string
  "пол"?: string
}
