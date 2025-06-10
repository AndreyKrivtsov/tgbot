import env from "env-var"

export interface AppConfig {
  // Основные настройки
  NODE_ENV: string
  BOT_TOKEN: string
  DATABASE_URL: string

  // Сервисы
  ANTISPAM_URL: string
  LLAMA_URL: string
  AI_API_KEY: string
  AI_API_THROTTLE: number

  // Опциональные сервисы
  REDIS_URL?: string

  // Веб-сервер
  WEB_PORT: number
  WEB_HOST: string

  // Админ
  ADMIN_USERNAME?: string

  // Блокировки
  LOCK_STORE: string
  DEFAULT_CHAT_ID: number

  // Логирование
  LOG_LEVEL: number
  LOG_USE_FILE: boolean
  LOG_NAME: string
  LOG_DIR: string
}

export const config: AppConfig = {
  NODE_ENV: env
    .get("NODE_ENV")
    .default("development")
    .asEnum(["production", "test", "development"]),

  BOT_TOKEN: env.get("BOT_TOKEN").required().asString(),

  DATABASE_URL: env.get("DATABASE_URL").required().asString(),

  ANTISPAM_URL: env.get("ANTISPAM_URL").required().asString(),

  LLAMA_URL: env.get("LLAMA_URL").required().asString(),

  AI_API_KEY: env.get("AI_API_KEY").required().asString(),

  AI_API_THROTTLE: env.get("AI_API_THROTTLE").default(120000).asInt(),

  // Опциональные сервисы
  REDIS_URL: env.get("REDIS_URL").asString(),

  // Веб-сервер
  WEB_PORT: env.get("WEB_PORT").default(3000).asPortNumber(),
  WEB_HOST: env.get("WEB_HOST").default("0.0.0.0").asString(),

  ADMIN_USERNAME: env.get("ADMIN_USERNAME").asString(),

  LOCK_STORE: env.get("LOCK_STORE").default("memory").asEnum(["memory"]),

  DEFAULT_CHAT_ID: env.get("DEFAULT_CHAT_ID").required().asInt(),

  LOG_LEVEL: env.get("LOG_LEVEL").default(2).asInt(),

  LOG_USE_FILE: env.get("LOG_USE_FILE").default(0).asBool(),

  LOG_NAME: env.get("LOG_NAME").default("").asString(),

  LOG_DIR: env.get("LOG_DIR").default("").asString(),
}
