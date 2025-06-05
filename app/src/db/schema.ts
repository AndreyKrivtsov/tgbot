import { 
  pgTable, 
  bigint, 
  varchar, 
  text, 
  boolean, 
  integer, 
  timestamp, 
  date,
  jsonb,
  index,
  primaryKey
} from "drizzle-orm/pg-core"

/**
 * Пользователи Telegram
 */
export const users = pgTable("users", {
  id: bigint("id", { mode: "number" }).primaryKey(), // Telegram user ID
  username: varchar("username", { length: 255 }),
  firstName: varchar("first_name", { length: 255 }),
  lastName: varchar("last_name", { length: 255 }),
  languageCode: varchar("language_code", { length: 10 }),
  isBot: boolean("is_bot").default(false),
  isRestricted: boolean("is_restricted").default(false),
  restrictionReason: text("restriction_reason"),
  messageCount: integer("message_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
}, (table) => ({
  usernameIdx: index("idx_users_username").on(table.username),
  createdAtIdx: index("idx_users_created_at").on(table.createdAt),
  messageCountIdx: index("idx_users_message_count").on(table.messageCount)
}))

/**
 * Чаты (группы/супергруппы)
 */
export const chats = pgTable("chats", {
  id: bigint("id", { mode: "number" }).primaryKey(), // Telegram chat ID
  type: varchar("type", { length: 50 }).notNull(), // 'private', 'group', 'supergroup'
  title: varchar("title", { length: 255 }),
  settings: jsonb("settings"), // Настройки бота для чата
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
}, (table) => ({
  typeIdx: index("idx_chats_type").on(table.type),
  activeIdx: index("idx_chats_active").on(table.isActive)
}))

/**
 * AI контексты чатов
 */
export const aiContexts = pgTable("ai_contexts", {
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  messages: jsonb("messages"), // История сообщений [{role, content, timestamp}]
  totalRequestCount: integer("total_request_count").default(0),
  dailyRequestCount: integer("daily_request_count").default(0),
  lastDailyReset: date("last_daily_reset").defaultNow(),
  lastActivity: timestamp("last_activity").defaultNow(),
  settings: jsonb("settings") // Настройки AI для чата (лимиты и т.д.)
}, (table) => ({
  lastActivityIdx: index("idx_ai_contexts_last_activity").on(table.lastActivity),
  dailyResetIdx: index("idx_ai_contexts_daily_reset").on(table.lastDailyReset)
}))

/**
 * Участники чатов (для отслеживания статуса)
 */
export const chatMembers = pgTable("chat_members", {
  chatId: bigint("chat_id", { mode: "number" }).notNull(),
  userId: bigint("user_id", { mode: "number" }).notNull(),
  status: varchar("status", { length: 50 }).notNull(), // 'member', 'administrator', 'owner', 'left', 'kicked'
  joinedAt: timestamp("joined_at").defaultNow(),
  leftAt: timestamp("left_at"),
  captchaSolved: boolean("captcha_solved").default(false),
  captchaSolvedAt: timestamp("captcha_solved_at")
}, (table) => ({
  pk: primaryKey({ columns: [table.chatId, table.userId] }),
  statusIdx: index("idx_chat_members_status").on(table.status),
  joinedAtIdx: index("idx_chat_members_joined_at").on(table.joinedAt)
}))

/**
 * Статистика работы бота
 */
export const botStats = pgTable("bot_stats", {
  date: date("date").primaryKey(),
  newUsers: integer("new_users").default(0),
  messagesProcessed: integer("messages_processed").default(0),
  aiRequests: integer("ai_requests").default(0),
  spamDetected: integer("spam_detected").default(0),
  captchaSolved: integer("captcha_solved").default(0),
  captchaFailed: integer("captcha_failed").default(0),
  captchaTimeout: integer("captcha_timeout").default(0)
}, (table) => ({
  dateIdx: index("idx_bot_stats_date").on(table.date)
}))

/**
 * Лог важных событий
 */
export const eventLogs = pgTable("event_logs", {
  id: bigint("id", { mode: "number" }).primaryKey(), // Auto-increment
  eventType: varchar("event_type", { length: 50 }).notNull(), // 'user_joined', 'spam_detected', 'ai_request', etc.
  chatId: bigint("chat_id", { mode: "number" }),
  userId: bigint("user_id", { mode: "number" }),
  data: jsonb("data"), // Дополнительные данные события
  createdAt: timestamp("created_at").defaultNow()
}, (table) => ({
  eventTypeIdx: index("idx_event_logs_event_type").on(table.eventType),
  createdAtIdx: index("idx_event_logs_created_at").on(table.createdAt),
  chatIdIdx: index("idx_event_logs_chat_id").on(table.chatId),
  userIdIdx: index("idx_event_logs_user_id").on(table.userId)
}))

/**
 * Типы данных для TypeScript
 */
export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert

export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert

export type AiContext = typeof aiContexts.$inferSelect
export type NewAiContext = typeof aiContexts.$inferInsert

export type ChatMember = typeof chatMembers.$inferSelect
export type NewChatMember = typeof chatMembers.$inferInsert

export type BotStats = typeof botStats.$inferSelect
export type NewBotStats = typeof botStats.$inferInsert

export type EventLog = typeof eventLogs.$inferSelect
export type NewEventLog = typeof eventLogs.$inferInsert