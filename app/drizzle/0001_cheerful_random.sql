CREATE TABLE "chat_configs" (
	"chat_id" bigint PRIMARY KEY NOT NULL,
	"gemini_api_key" varchar(512),
	"system_prompt" jsonb,
	"ai_enabled" boolean DEFAULT true,
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
CREATE INDEX "idx_group_admins_user" ON "group_admins" USING btree ("user_id");