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
 * Таблица чатов с базовой информацией
 * 
 * Хранит информацию о зарегистрированных чатах Telegram.
 * Используется для проверки активности чата, фильтрации по типу и управления жизненным циклом.
 * 
 * @see ChatRepository для методов работы с этой таблицей
 */
export const chats = pgTable("chats", {
  /** Telegram chat ID - уникальный идентификатор чата (может быть отрицательным для групп) */
  id: bigint("id", { mode: "number" }).primaryKey(),
  
  /** Тип чата: 'private', 'group', 'supergroup' - определяет поведение бота */
  type: varchar("type", { length: 50 }).notNull(),
  
  /** Название чата (может быть NULL для приватных чатов) */
  title: varchar("title", { length: 255 }),
  
  /** Флаг активности чата в системе (false = деактивирован, но не удален) */
  active: boolean("active").default(true),
  
  /** Дата и время создания записи в базе данных */
  createdAt: timestamp("created_at").defaultNow(),
  
  /** Дата и время последнего обновления записи */
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => ({
  /** Индекс для быстрого поиска по типу чата */
  typeIdx: index("idx_chats_type").on(table.type),
  
  /** Индекс для фильтрации активных/неактивных чатов */
  activeIdx: index("idx_chats_active").on(table.active),
}))

/**
 * Конфигурация ИИ для чатов
 * 
 * Хранит настройки ИИ для каждого чата. Связь один-к-одному с таблицей chats.
 * API ключи хранятся per-chat (не глобально), что позволяет использовать разные ключи для разных групп.
 * 
 * @see ChatRepository для методов работы с конфигурацией
 * @see SystemPromptData для структуры systemPrompt
 */
export const chatConfigs = pgTable("chat_configs", {
  /** ID чата - внешний ключ на chats.id (PRIMARY KEY, связь один-к-одному) */
  chatId: bigint("chat_id", { mode: "number" }).primaryKey(),
  
  /** 
   * API ключ Google Gemini для этого чата
   * Хранится в открытом виде (не хешируется), так как используется для прямых запросов к API
   * Может быть NULL - в этом случае используется дефолтный промпт без API вызовов
   */
  geminiApiKey: varchar("gemini_api_key", { length: 512 }),
  
  /** 
   * Системный промпт в формате JSONB
   * Структура: { "основные правила"?: string, "характер"?: string, "пол"?: string }
   * Используется для персонализации поведения ИИ в конкретном чате
   * @see SystemPromptData для TypeScript типа
   */
  systemPrompt: jsonb("system_prompt").$type<{
    "основные правила"?: string
    "характер"?: string
    "пол"?: string
  }>(),
  
  /** Флаг включения/выключения ИИ в этом чате (управляется командой /ultron) */
  aiEnabled: boolean("ai_enabled").default(true),
  
  /** Дата и время создания конфигурации */
  createdAt: timestamp("created_at").defaultNow(),
  
  /** Дата и время последнего обновления конфигурации */
  updatedAt: timestamp("updated_at").defaultNow(),
}, table => ({
  /** Индекс для быстрого поиска чатов с включенным/выключенным ИИ */
  aiEnabledIdx: index("idx_chat_configs_ai_enabled").on(table.aiEnabled),
}))

/**
 * Администраторы групп
 * 
 * Кеширует список администраторов групп для быстрой проверки прав доступа.
 * Данные синхронизируются с Telegram API при регистрации группы через команду /register.
 * Используется для проверки прав на выполнение команд модерации (/ban, /mute, /ultron и др.).
 * 
 * @see ChatRepository.addAdmin() для добавления администраторов
 * @see ChatRepository.isAdmin() для проверки прав
 */
export const groupAdmins = pgTable("group_admins", {
  /** ID группы (Telegram chat ID, отрицательное число для групп) */
  groupId: bigint("group_id", { mode: "number" }).notNull(),
  
  /** ID пользователя-администратора (Telegram user ID) */
  userId: bigint("user_id", { mode: "number" }).notNull(),

  /** Username администратора (может отсутствовать) */
  username: varchar("username", { length: 64 }),
  
  /** Дата и время добавления администратора в базу */
  createdAt: timestamp("created_at").defaultNow(),
}, table => ({
  /** Составной первичный ключ - одна запись на пару (groupId, userId) */
  pk: primaryKey({ columns: [table.groupId, table.userId] }),
  
  /** Индекс для быстрого поиска всех администраторов конкретной группы */
  groupIdx: index("idx_group_admins_group").on(table.groupId),
  
  /** Индекс для быстрого поиска всех групп, где пользователь является администратором */
  userIdx: index("idx_group_admins_user").on(table.userId),
}))

/**
 * Типы данных для TypeScript
 * 
 * Автоматически выводятся из схемы Drizzle ORM.
 * Используются для типобезопасной работы с данными в репозиториях и сервисах.
 */

/** Тип для чтения записи чата из базы данных */
export type Chat = typeof chats.$inferSelect

/** Тип для создания новой записи чата (все поля опциональны, кроме обязательных) */
export type NewChat = typeof chats.$inferInsert

/** Тип для чтения конфигурации ИИ чата из базы данных */
export type ChatConfig = typeof chatConfigs.$inferSelect

/** Тип для создания новой конфигурации ИИ (все поля опциональны, кроме chatId) */
export type NewChatConfig = typeof chatConfigs.$inferInsert

/** Тип для чтения записи администратора группы из базы данных */
export type GroupAdmin = typeof groupAdmins.$inferSelect

/** Тип для создания новой записи администратора (все поля опциональны, кроме обязательных) */
export type NewGroupAdmin = typeof groupAdmins.$inferInsert

/**
 * Тип для системного промпта ИИ
 * 
 * Структура JSONB поля systemPrompt в таблице chat_configs.
 * Используется для персонализации поведения ИИ в конкретном чате.
 * 
 * @example
 * ```typescript
 * const prompt: SystemPromptData = {
 *   "основные правила": "Будь вежливым и дружелюбным",
 *   "характер": "Веселый и общительный",
 *   "пол": "Мужской"
 * }
 * ```
 * 
 * @see ChatRepository.buildSystemPromptString() для преобразования в строку
 * @see ChatRepository.setSystemPrompt() для установки промпта
 */
export interface SystemPromptData {
  /** Основные правила поведения ИИ в чате */
  "основные правила"?: string
  /** Характер и стиль общения ИИ */
  "характер"?: string
  /** Пол персонажа ИИ */
  "пол"?: string
}
