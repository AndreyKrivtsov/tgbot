import { jest } from "@jest/globals"
import type { AppConfig } from "../../config.js"
import type { Logger } from "../../helpers/Logger.js"
import type { EventBus } from "../../core/EventBus.js"

export function makeConfig(): AppConfig {
  return ({
    NODE_ENV: "test",
    BOT_TOKEN: "test",
    DATABASE_URL: "postgres://test",
    ANTISPAM_URL: "http://127.0.0.1:6323",
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

export function makeEventBus(): EventBus {
  const emit = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const emitFunc = jest.fn<() => Promise<void>>().mockResolvedValue(undefined)
  
  return ({
    on: jest.fn(),
    emit,
    onMessageReceived: jest.fn(),
    emitMessageReceived: emitFunc,
    onSpamDetected: jest.fn(),
    emitSpamDetected: emitFunc,
    onCaptchaPassed: jest.fn(),
    emitCaptchaPassed: emitFunc,
    onCaptchaFailed: jest.fn(),
    emitCaptchaFailed: emitFunc,
    onCaptchaMessageSent: jest.fn(),
    emitCaptchaMessageSent: emitFunc,
    onAIResponse: jest.fn(),
    emitAIResponse: emitFunc,
    onModerationBatchResult: jest.fn(),
    emitModerationBatchResult: emitFunc,
    onMemberJoined: jest.fn(),
    emitMemberJoined: emitFunc,
    onMemberLeft: jest.fn(),
    emitMemberLeft: emitFunc,
    onChatMemberUpdated: jest.fn(),
    emitChatMemberUpdated: emitFunc,
    onCommandRegister: jest.fn(),
    emitCommandRegister: emitFunc,
    onCommandUnregister: jest.fn(),
    emitCommandUnregister: emitFunc,
    onCommandBan: jest.fn(),
    emitCommandBan: emitFunc,
    onCommandUnban: jest.fn(),
    emitCommandUnban: emitFunc,
    onCommandMute: jest.fn(),
    emitCommandMute: emitFunc,
    onCommandUnmute: jest.fn(),
    emitCommandUnmute: emitFunc,
    onCommandUltronToggle: jest.fn(),
    emitCommandUltronToggle: emitFunc,
    onCommandAddAltronKey: jest.fn(),
    emitCommandAddAltronKey: emitFunc,
  } as unknown as EventBus)
}

export function makeFakeBot() {
  return ({
    deleteMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    sendMessage: jest.fn<() => Promise<any>>().mockResolvedValue({ messageId: 1 }),
    sendGroupMessage: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    restrictUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    kickUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    banUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    unbanUser: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    getChatAdministrators: jest.fn<() => Promise<any[]>>().mockResolvedValue([]),
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
