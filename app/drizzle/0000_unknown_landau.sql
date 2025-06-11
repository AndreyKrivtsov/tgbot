CREATE TABLE "chat_configs" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"gemini_api_key" varchar(512),
	"system_prompt" jsonb,
	"ai_enabled" boolean DEFAULT true,
	"throttle_delay" integer DEFAULT 3000,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "chats" (
	"id" bigint PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" varchar(255),
	"active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "group_admins" (
	"group_id" bigint NOT NULL,
	"user_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "group_admins_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE INDEX "idx_chat_configs_ai_enabled" ON "chat_configs" USING btree ("ai_enabled");--> statement-breakpoint
CREATE INDEX "idx_chats_type" ON "chats" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_chats_active" ON "chats" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_group_admins_group" ON "group_admins" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_group_admins_user" ON "group_admins" USING btree ("user_id");--> statement-breakpoint

-- Добавление тестовых данных
-- Тестовые чаты
INSERT INTO "chats" ("id", "type", "title", "active", "created_at", "updated_at") VALUES
(-1001728167877, 'supergroup', 'СОСЕДИ Океанус (Начанг)', true, now(), now()),
(-1002288402895, 'supergroup', 'Подслушано Океанус', true, now(), now())
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

-- Конфигурации для тестовых чатов
INSERT INTO "chat_configs" ("chat_id", "gemini_api_key", "system_prompt", "ai_enabled", "throttle_delay", "created_at", "updated_at") VALUES
(-1001728167877, NULL, '{"prompt": "Ты - дружелюбный помощник в чате соседей. Помогай с бытовыми вопросами, будь вежливым."}', true, 3000, now(), now()),
(-1002288402895, NULL, '{"prompt": "Ты - модератор подслушанного чата. Отвечай остроумно, но дружелюбно."}', true, 3000, now(), now())
ON CONFLICT ("chat_id") DO NOTHING;
--> statement-breakpoint

-- Администраторы (пример пользователя)
INSERT INTO "group_admins" ("group_id", "user_id", "created_at") VALUES
(-1001728167877, 1029337724, now()),
(-1002288402895, 1029337724, now())
ON CONFLICT ("group_id", "user_id") DO NOTHING;