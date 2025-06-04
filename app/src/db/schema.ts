import { relations } from "drizzle-orm"
import { boolean, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"

// Группы Telegram
export const groups = pgTable("groups", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  settings: jsonb("settings").default({}),
  aiConfig: jsonb("ai_config").default({}),
  status: varchar("status", { length: 20 }).notNull().default("active"), // active, inactive, suspended
  ownerId: integer("owner_id"), // Telegram user ID владельца
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Пользователи
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  telegramId: text("telegram_id").notNull().unique(),
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  role: varchar("role", { length: 20 }).notNull().default("user"), // admin, user, moderator
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Участники групп
export const groupMembers = pgTable("group_members", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  role: varchar("role", { length: 20 }).notNull().default("member"), // admin, member, moderator
  permissions: jsonb("permissions").default({}),
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
  leftAt: timestamp("left_at"),
}, (table) => ({
  uniqueGroupUser: uniqueIndex("unique_group_user").on(table.groupId, table.userId),
}))

// Диалоги/конверсации
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").notNull().references(() => users.id),
  context: jsonb("context").default({}), // Контекст диалога для AI
  metadata: jsonb("metadata").default({}), // Дополнительные данные
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Сообщения
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id").notNull().references(() => conversations.id),
  telegramMessageId: text("telegram_message_id").notNull(),
  content: text("content").notNull(),
  aiResponse: text("ai_response"),
  messageType: varchar("message_type", { length: 20 }).notNull().default("text"), // text, photo, document, etc.
  metadata: jsonb("metadata").default({}),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
})

// Настройки групп (детальные)
export const groupSettings = pgTable("group_settings", {
  groupId: integer("group_id").primaryKey().references(() => groups.id),
  aiProvider: varchar("ai_provider", { length: 50 }).default("openai"), // openai, anthropic, local
  aiModel: varchar("ai_model", { length: 100 }).default("gpt-4"),
  systemPrompt: text("system_prompt"),
  customPrompts: jsonb("custom_prompts").default({}),
  featuresEnabled: jsonb("features_enabled").default({
    aiChat: true,
    antiSpam: true,
    moderation: false,
    analytics: true,
  }),
  rateLimits: jsonb("rate_limits").default({
    messagesPerMinute: 10,
    messagesPerHour: 60,
    maxContextLength: 4000,
  }),
  autoModerationRules: jsonb("auto_moderation_rules").default({}),
  webhookUrl: text("webhook_url"), // Для интеграций
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// AI провайдеры и их настройки
export const aiProviders = pgTable("ai_providers", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  type: varchar("type", { length: 50 }).notNull(), // openai, anthropic, local, custom
  config: jsonb("config").notNull(), // API keys, endpoints, etc.
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

// Аналитика и статистика
export const analytics = pgTable("analytics", {
  id: serial("id").primaryKey(),
  groupId: integer("group_id").notNull().references(() => groups.id),
  userId: integer("user_id").references(() => users.id),
  eventType: varchar("event_type", { length: 50 }).notNull(), // message, command, ai_request, etc.
  eventData: jsonb("event_data").default({}),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
})

// Системные логи
export const systemLogs = pgTable("system_logs", {
  id: serial("id").primaryKey(),
  level: varchar("level", { length: 10 }).notNull(), // error, warn, info, debug
  message: text("message").notNull(),
  context: jsonb("context").default({}),
  groupId: integer("group_id").references(() => groups.id),
  userId: integer("user_id").references(() => users.id),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
})

// Отношения между таблицами
export const groupsRelations = relations(groups, ({ many, one }) => ({
  members: many(groupMembers),
  conversations: many(conversations),
  settings: one(groupSettings, {
    fields: [groups.id],
    references: [groupSettings.groupId],
  }),
  analytics: many(analytics),
}))

export const usersRelations = relations(users, ({ many }) => ({
  groupMemberships: many(groupMembers),
  conversations: many(conversations),
  analytics: many(analytics),
}))

export const groupMembersRelations = relations(groupMembers, ({ one }) => ({
  group: one(groups, {
    fields: [groupMembers.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [groupMembers.userId],
    references: [users.id],
  }),
}))

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  group: one(groups, {
    fields: [conversations.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [conversations.userId],
    references: [users.id],
  }),
  messages: many(messages),
}))

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}))

export const groupSettingsRelations = relations(groupSettings, ({ one }) => ({
  group: one(groups, {
    fields: [groupSettings.groupId],
    references: [groups.id],
  }),
}))

export const analyticsRelations = relations(analytics, ({ one }) => ({
  group: one(groups, {
    fields: [analytics.groupId],
    references: [groups.id],
  }),
  user: one(users, {
    fields: [analytics.userId],
    references: [users.id],
  }),
}))

// Типы для TypeScript
export type Group = typeof groups.$inferSelect
export type NewGroup = typeof groups.$inferInsert
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type GroupMember = typeof groupMembers.$inferSelect
export type NewGroupMember = typeof groupMembers.$inferInsert
export type Conversation = typeof conversations.$inferSelect
export type NewConversation = typeof conversations.$inferInsert
export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert
export type GroupSettings = typeof groupSettings.$inferSelect
export type NewGroupSettings = typeof groupSettings.$inferInsert
export type AIProvider = typeof aiProviders.$inferSelect
export type NewAIProvider = typeof aiProviders.$inferInsert
export type Analytics = typeof analytics.$inferSelect
export type NewAnalytics = typeof analytics.$inferInsert
export type SystemLog = typeof systemLogs.$inferSelect
export type NewSystemLog = typeof systemLogs.$inferInsert
