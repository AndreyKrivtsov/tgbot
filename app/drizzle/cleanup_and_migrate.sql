-- ==========================================
-- СОЗДАНИЕ СХЕМЫ БАЗЫ ДАННЫХ
-- ==========================================

-- 1. Создаем таблицы согласно схеме
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

-- 2. Создаем индексы для оптимизации производительности
CREATE INDEX IF NOT EXISTS "idx_chats_type" ON "chats" USING btree ("type");
CREATE INDEX IF NOT EXISTS "idx_chats_active" ON "chats" USING btree ("active");
CREATE INDEX IF NOT EXISTS "idx_chat_configs_ai_enabled" ON "chat_configs" USING btree ("ai_enabled");
CREATE INDEX IF NOT EXISTS "idx_group_admins_group" ON "group_admins" USING btree ("group_id");
CREATE INDEX IF NOT EXISTS "idx_group_admins_user" ON "group_admins" USING btree ("user_id");

-- 3. Добавляем внешние ключи (только если они еще не существуют)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_chat_configs_chat_id'
    ) THEN
        ALTER TABLE "chat_configs" ADD CONSTRAINT "fk_chat_configs_chat_id" 
            FOREIGN KEY ("chat_id") REFERENCES "chats"("id") ON DELETE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_group_admins_group_id'
    ) THEN
        ALTER TABLE "group_admins" ADD CONSTRAINT "fk_group_admins_group_id" 
            FOREIGN KEY ("group_id") REFERENCES "chats"("id") ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Добавляем комментарии к таблицам
COMMENT ON TABLE "chats" IS 'Базовая информация о чатах Telegram';
COMMENT ON TABLE "chat_configs" IS 'Конфигурация ИИ для чатов';
COMMENT ON TABLE "group_admins" IS 'Администраторы групп';

-- 5. Добавляем комментарии к полям
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
-- ДОБАВЛЕНИЕ ТЕСТОВЫХ ДАННЫХ
-- ==========================================

-- 6. Добавляем тестовые чаты
INSERT INTO "chats" ("id", "type", "title", "active", "created_at", "updated_at") 
VALUES 
    (-1001728167877, 'supergroup', 'СОСЕДИ Океанус (Начанг)', true, now(), now()),
    (-1002288402895, 'supergroup', 'Подслушано Океанус', true, now(), now())
ON CONFLICT ("id") DO NOTHING;

-- 7. Добавляем конфигурации для тестовых чатов с дефолтными настройками
INSERT INTO "chat_configs" ("chat_id", "ai_enabled", "throttle_delay", "created_at", "updated_at")
VALUES 
    (-1001728167877, true, 3000, now(), now()),
    (-1002288402895, true, 3000, now(), now())
ON CONFLICT ("chat_id") DO NOTHING;

-- 8. Добавляем администратора для обоих чатов
INSERT INTO "group_admins" ("group_id", "user_id", "created_at")
VALUES 
    (-1001728167877, 1029337724, now()),
    (-1002288402895, 1029337724, now())
ON CONFLICT ("group_id", "user_id") DO NOTHING;

-- ==========================================
-- СОЗДАНИЕ СХЕМЫ ЗАВЕРШЕНО
-- ========================================== 