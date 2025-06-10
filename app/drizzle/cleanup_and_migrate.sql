-- ==========================================
-- ПОЛНАЯ ОЧИСТКА И МИГРАЦИЯ БАЗЫ ДАННЫХ
-- ==========================================

-- 1. Удаляем все существующие таблицы (в правильном порядке)
DROP TABLE IF EXISTS event_logs CASCADE;
DROP TABLE IF EXISTS bot_stats CASCADE;
DROP TABLE IF EXISTS chat_members CASCADE;
DROP TABLE IF EXISTS ai_contexts CASCADE;
DROP TABLE IF EXISTS chat_configs CASCADE;
DROP TABLE IF EXISTS group_admins CASCADE;
DROP TABLE IF EXISTS chats CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- 2. Создаем новые таблицы согласно обновленной схеме
CREATE TABLE "chats" (
	"id" bigint PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255),
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "chat_configs" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"gemini_api_key" varchar(512),
	"system_prompt" jsonb,
	"ai_enabled" boolean DEFAULT true,
	"throttle_delay" integer DEFAULT 3000,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);

CREATE TABLE "group_admins" (
	"group_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "group_admins_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);

-- 3. Создаем индексы для оптимизации производительности
CREATE INDEX "idx_chats_type" ON "chats" USING btree ("type");
CREATE INDEX "idx_chats_active" ON "chats" USING btree ("active");
CREATE INDEX "idx_chat_configs_ai_enabled" ON "chat_configs" USING btree ("ai_enabled");
CREATE INDEX "idx_group_admins_group" ON "group_admins" USING btree ("group_id");
CREATE INDEX "idx_group_admins_user" ON "group_admins" USING btree ("user_id");

-- 4. Добавляем внешние ключи
ALTER TABLE "chat_configs" ADD CONSTRAINT "fk_chat_configs_chat_id" 
    FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;

ALTER TABLE "group_admins" ADD CONSTRAINT "fk_group_admins_group_id" 
    FOREIGN KEY ("group_id") REFERENCES "chats"("id") ON DELETE CASCADE;

-- 5. Добавляем комментарии к таблицам
COMMENT ON TABLE "chats" IS 'Базовая информация о чатах Telegram';
COMMENT ON TABLE "chat_configs" IS 'Конфигурация ИИ для чатов';
COMMENT ON TABLE "group_admins" IS 'Администраторы групп';

-- 6. Добавляем комментарии к полям
COMMENT ON COLUMN "chats"."id" IS 'Telegram chat ID';
COMMENT ON COLUMN "chats"."type" IS 'Тип чата: private, group, supergroup';
COMMENT ON COLUMN "chats"."title" IS 'Название чата';
COMMENT ON COLUMN "chats"."active" IS 'Активен ли чат';

COMMENT ON COLUMN "chat_configs"."chat_id" IS 'ID чата (ссылка на chats.id)';
COMMENT ON COLUMN "chat_configs"."gemini_api_key" IS 'API ключ для Gemini';
COMMENT ON COLUMN "chat_configs"."system_prompt" IS 'Системный промпт в JSON формате';
COMMENT ON COLUMN "chat_configs"."ai_enabled" IS 'Включен ли ИИ в чате';
COMMENT ON COLUMN "chat_configs"."throttle_delay" IS 'Задержка между запросами в миллисекундах';

COMMENT ON COLUMN "group_admins"."group_id" IS 'ID группы';
COMMENT ON COLUMN "group_admins"."user_id" IS 'ID пользователя-администратора';

-- ==========================================
-- МИГРАЦИЯ ЗАВЕРШЕНА
-- ========================================== 