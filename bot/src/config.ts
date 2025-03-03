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
  AISTUDIO_KEY: env.get("AISTUDIO_KEY").required().asString(),
}
