import { jest } from "@jest/globals"
import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { CaptchaActionsPort } from "../../services/CaptchaService/index.js"

export function makeConfig(): AppConfig {
  return ({
    NODE_ENV: "test",
    BOT_TOKEN: "test",
    DATABASE_URL: "postgres://test",
    ANTISPAM_URL: "http://127.0.0.1:6323",
    LLAMA_URL: "http://127.0.0.1:11434",
    REDIS_URL: "redis://127.0.0.1:6379",
    PORT: 3000,
    ADMIN_USERNAME: "admin",
    PROXY_ENABLED: false,
    PROXY_URL: "",
    PROXY_USERNAME: "",
    PROXY_PASSWORD: "",
    LOG_LEVEL: 2,
    LOG_USE_FILE: false,
    LOG_NAME: "",
    LOG_DIR: "",
  } as unknown as AppConfig)
}

export function makeLogger(): Logger {
  return ({
    i: jest.fn(),
    w: jest.fn(),
    e: jest.fn(),
    d: jest.fn(),
  } as unknown as Logger)
}

export function makeActions(): CaptchaActionsPort {
  return ({
    sendCaptchaMessage: jest.fn().mockResolvedValue(123),
    sendResultMessage: jest.fn().mockResolvedValue(undefined),
    restrictUser: jest.fn().mockResolvedValue(undefined),
    unrestrictUser: jest.fn().mockResolvedValue(undefined),
    kickUser: jest.fn().mockResolvedValue(undefined),
    deleteMessage: jest.fn().mockResolvedValue(undefined),
  } as unknown as CaptchaActionsPort)
}

export function makeFakeBot() {
  return ({
    deleteMessage: jest.fn().mockResolvedValue(undefined),
    sendMessage: jest.fn().mockResolvedValue({ messageId: 1 }),
    sendGroupMessage: jest.fn().mockResolvedValue(undefined),
    restrictUser: jest.fn().mockResolvedValue(undefined),
    kickUser: jest.fn().mockResolvedValue(undefined),
    banUser: jest.fn().mockResolvedValue(undefined),
    unbanUser: jest.fn().mockResolvedValue(undefined),
    getChatAdministrators: jest.fn().mockResolvedValue([]),
  })
}

export function makeUser(id: number, username = "user", firstName = "User", isBot = false) {
  return ({
    id,
    username,
    firstName,
    isBot: () => isBot,
  })
}

export const __test_utils__ = true
