import env from "env-var"

export interface AppConfig {
  NODE_ENV: string
  BOT_TOKEN: string
  DATABASE_URL: string
  ANTISPAM_URL: string
  ADMIN_USERNAME?: string
  LOCK_STORE: string
  DEFAULT_CHAT_ID: number
  LLAMA_URL: string
  AI_API_KEY: string
  AI_API_THROTTLE: number
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

  ADMIN_USERNAME: env.get("ADMIN_USERNAME").asString(),

  LOCK_STORE: env.get("LOCK_STORE").default("memory").asEnum(["memory"]),

  DEFAULT_CHAT_ID: env.get("DEFAULT_CHAT_ID").required().asInt(),

  LLAMA_URL: env.get("LLAMA_URL").required().asString(),

  AI_API_KEY: env.get("AI_API_KEY").required().asString(),

  AI_API_THROTTLE: env.get("AI_API_THROTTLE").default(120000).asInt(),

  LOG_LEVEL: env.get("LOG_LEVEL").default(2).asInt(),

  LOG_USE_FILE: env.get("LOG_USE_FILE").default(0).asBool(),

  LOG_NAME: env.get("LOG_NAME").default("").asString(),

  LOG_DIR: env.get("LOG_DIR").default("").asString(),
}
