import env from "env-var"

export const config = {
  NODE_ENV: env
    .get("NODE_ENV")
    .default("development")
    .asEnum(["production", "test", "development"]),
  BOT_TOKEN: env.get("BOT_TOKEN").required().asString(),

  DATABASE_URL: env.get("DATABASE_URL").required().asString(),
  LOCK_STORE: env.get("LOCK_STORE").default("memory").asEnum(["memory"]),
  DEFAULT_CHAT_ID: env.get("DEFAULT_CHAT_ID").required().asInt(),
  LLAMA_URL: env.get("LLAMA_URL").required().asString(),
  AI_API_KEY: env.get("AI_API_KEY").required().asString(),
  AI_API_THROTTLE: env.get("AI_API_THROTTLE").default(120000).asInt(),
  LOG_LEVEL: env.get("LOG_LEVEL").default(2).asInt(),
  LOG_FILE: env.get("LOG_FILE").default(0).asBool(),
  LOG_DIR: env.get("LOG_DIR").default("").asString(),
}
