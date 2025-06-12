# 🗄️ Схема базы данных

## 📋 Содержание

- [Общий обзор](#общий-обзор)
- [Технологии](#технологии)
- [Структура таблиц](#структура-таблиц)
- [Связи между таблицами](#связи-между-таблицами)
- [Индексы](#индексы)
- [Типы данных TypeScript](#типы-данных-typescript)
- [Миграции](#миграции)

## 🎯 Общий обзор

База данных проекта построена на **PostgreSQL** с использованием **Drizzle ORM** для типобезопасной работы с данными. Схема оптимизирована для работы с Telegram чатами, конфигурацией ИИ и управлением администраторами групп.

## 🛠️ Технологии

- **PostgreSQL** - основная СУБД
- **Drizzle ORM** - ORM с полной поддержкой TypeScript
- **Drizzle Kit** - инструменты для миграций и управления схемой

## 📊 Структура таблиц

### 1. Таблица `chats`

Хранит базовую информацию о чатах Telegram.

```sql
CREATE TABLE chats (
  id BIGINT PRIMARY KEY,           -- Telegram chat ID
  type VARCHAR(50) NOT NULL,       -- 'private', 'group', 'supergroup'
  title VARCHAR(255),              -- Название чата (для групп)
  active BOOLEAN DEFAULT true,     -- Активен ли чат
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Описание полей:**
- `id` - уникальный идентификатор чата из Telegram API
- `type` - тип чата (приватный, группа, супергруппа)
- `title` - название чата (только для групп)
- `active` - флаг активности чата
- `created_at` - время создания записи
- `updated_at` - время последнего обновления

### 2. Таблица `chat_configs`

Конфигурация ИИ и настройки для каждого чата.

```sql
CREATE TABLE chat_configs (
  chat_id BIGINT PRIMARY KEY,      -- Ссылка на chats.id
  gemini_api_key VARCHAR(512),     -- API ключ для Gemini AI
  system_prompt JSONB,             -- Системный промпт в JSON формате
  ai_enabled BOOLEAN DEFAULT true, -- Включен ли ИИ
  throttle_delay INTEGER DEFAULT 3000, -- Задержка между запросами (мс)
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Описание полей:**
- `chat_id` - ссылка на таблицу `chats`
- `gemini_api_key` - API ключ для доступа к Gemini AI
- `system_prompt` - системный промпт в JSON формате
- `ai_enabled` - включен ли ИИ в данном чате
- `throttle_delay` - задержка между запросами к ИИ в миллисекундах

**Структура system_prompt (JSON):**
```json
{
  "основные правила": "Базовые правила поведения ИИ",
  "характер": "Описание характера и стиля общения",
  "пол": "Пол ИИ персонажа"
}
```

### 3. Таблица `group_admins`

Связь между группами и их администраторами.

```sql
CREATE TABLE group_admins (
  group_id BIGINT NOT NULL,        -- ID группы
  user_id BIGINT NOT NULL,         -- ID пользователя-администратора
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (group_id, user_id)
);
```

**Описание полей:**
- `group_id` - идентификатор группы
- `user_id` - идентификатор пользователя-администратора
- `created_at` - время назначения администратором

## 🔗 Связи между таблицами

```mermaid
erDiagram
    chats ||--o| chat_configs : "chat_id"
    chats ||--o{ group_admins : "group_id"
    
    chats {
        bigint id PK
        varchar type
        varchar title
        boolean active
        timestamp created_at
        timestamp updated_at
    }
    
    chat_configs {
        bigint chat_id PK,FK
        varchar gemini_api_key
        jsonb system_prompt
        boolean ai_enabled
        integer throttle_delay
        timestamp created_at
        timestamp updated_at
    }
    
    group_admins {
        bigint group_id PK,FK
        bigint user_id PK
        timestamp created_at
    }
```

## 📈 Индексы

Для оптимизации производительности созданы следующие индексы:

### Таблица `chats`:
```sql
CREATE INDEX idx_chats_type ON chats(type);
CREATE INDEX idx_chats_active ON chats(active);
```

### Таблица `chat_configs`:
```sql
CREATE INDEX idx_chat_configs_ai_enabled ON chat_configs(ai_enabled);
```

### Таблица `group_admins`:
```sql
CREATE INDEX idx_group_admins_group ON group_admins(group_id);
CREATE INDEX idx_group_admins_user ON group_admins(user_id);
```

## 📝 Типы данных TypeScript

Drizzle ORM автоматически генерирует типы TypeScript для безопасной работы с данными:

```typescript
// Основные типы таблиц
export type Chat = typeof chats.$inferSelect
export type NewChat = typeof chats.$inferInsert

export type ChatConfig = typeof chatConfigs.$inferSelect
export type NewChatConfig = typeof chatConfigs.$inferInsert  

export type GroupAdmin = typeof groupAdmins.$inferSelect
export type NewGroupAdmin = typeof groupAdmins.$inferInsert

// Специальный тип для системного промпта
export interface SystemPromptData {
  "основные правила"?: string
  "характер"?: string
  "пол"?: string
}
```

### Примеры использования:

```typescript
// Создание нового чата
const newChat: NewChat = {
  id: 123456789,
  type: 'group',
  title: 'Мой чат',
  active: true
}

// Обновление конфигурации чата
const config: NewChatConfig = {
  chatId: 123456789,
  aiEnabled: true,
  systemPrompt: {
    "основные правила": "Будь вежливым и полезным",
    "характер": "Дружелюбный помощник",
    "пол": "мужской"
  },
  throttleDelay: 2000
}
```

## 🚀 Миграции

### Команды для работы с миграциями:

```bash
# Генерация миграций на основе изменений схемы
npm run db:generate

# Применение миграций к базе данных
npm run db:migrate

# Просмотр данных через веб-интерфейс
npm run db:studio

# Push изменений схемы напрямую (для разработки)
npm run db:push

# Удаление схемы (осторожно!)
npm run db:drop
```

### Пример миграции:

```sql
-- Migration: 0001_initial_schema.sql
CREATE TABLE IF NOT EXISTS "chats" (
	"id" bigint PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255),
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "chat_configs" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"gemini_api_key" varchar(512),
	"system_prompt" jsonb,
	"ai_enabled" boolean DEFAULT true,
	"throttle_delay" integer DEFAULT 3000,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "group_admins" (
	"group_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "group_admins_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);

-- Создание индексов
CREATE INDEX IF NOT EXISTS "idx_chats_type" ON "chats" ("type");
CREATE INDEX IF NOT EXISTS "idx_chats_active" ON "chats" ("active");
CREATE INDEX IF NOT EXISTS "idx_chat_configs_ai_enabled" ON "chat_configs" ("ai_enabled");
CREATE INDEX IF NOT EXISTS "idx_group_admins_group" ON "group_admins" ("group_id");
CREATE INDEX IF NOT EXISTS "idx_group_admins_user" ON "group_admins" ("user_id");
```

## 🔧 Конфигурация подключения

Подключение к базе данных настраивается через переменную окружения:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/telegram_bot"
```

### Drizzle конфигурация (`drizzle.config.ts`):

```typescript
import type { Config } from 'drizzle-kit'

export default {
  schema: './src/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
} satisfies Config
```

## 📊 Производительность

### Рекомендации:
1. **Используйте индексы** - все часто запрашиваемые поля индексированы
2. **Ограничивайте выборки** - используйте LIMIT для больших таблиц
3. **Кешируйте данные** - часто используемые данные кешируются в Redis
4. **Мониторинг** - отслеживайте медленные запросы

### Примеры оптимизированных запросов:

```typescript
// Получение активных чатов с ИИ
const activeAIChats = await db
  .select()
  .from(chats)
  .innerJoin(chatConfigs, eq(chats.id, chatConfigs.chatId))
  .where(
    and(
      eq(chats.active, true),
      eq(chatConfigs.aiEnabled, true)
    )
  )
  .limit(100)

// Поиск администраторов группы
const groupAdmins = await db
  .select()
  .from(groupAdmins)
  .where(eq(groupAdmins.groupId, chatId))
```

---

> 💡 **Следующие разделы**: [Настройка БД](./DATABASE_SETUP.md) | [Архитектура](./ARCHITECTURE_OVERVIEW.md)
