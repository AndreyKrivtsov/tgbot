import env from "env-var"

export interface AppConfig {
  // Основные настройки
  NODE_ENV: string
  BOT_TOKEN: string
  DATABASE_URL: string

  // Сервисы
  ANTISPAM_URL: string

  // Опциональные сервисы
  REDIS_URL: string

  // Веб-сервер
  PORT: number

  // Админ
  ADMIN_USERNAME?: string

  // Прокси
  PROXY_ENABLED: boolean
  PROXY_URL?: string
  PROXY_USERNAME?: string
  PROXY_PASSWORD?: string

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

  // Опциональные сервисы
  REDIS_URL: env.get("REDIS_URL").required().asString(),

  // Веб-сервер
  PORT: env.get("PORT").default(3000).asPortNumber(),

  ADMIN_USERNAME: env.get("ADMIN_USERNAME").asString(),

  // Прокси
  PROXY_ENABLED: env.get("PROXY_ENABLED").default("false").asBool(),
  PROXY_URL: env.get("PROXY_URL").asString(),
  PROXY_USERNAME: env.get("PROXY_USERNAME").default("").asString(),
  PROXY_PASSWORD: env.get("PROXY_PASSWORD").default("").asString(),

  LOG_LEVEL: env.get("LOG_LEVEL").default(2).asInt(),

  LOG_USE_FILE: env.get("LOG_USE_FILE").default("true").asBool(),

  LOG_NAME: env.get("LOG_NAME").default("").asString(),

  LOG_DIR: env.get("LOG_DIR").default("").asString(),
}
