/**
 * Экспорт всех интерфейсов для AIChatService
 */

export { AdaptiveChatThrottleManager } from "../../helpers/ai/AdaptiveThrottleManager.js"

// Экспорт рефакторированного сервиса
export { AIChatService } from "./AIChatService.js"

// Экспорт интерфейсов из AIResponseService
export type {
  AIResponseParams,
  AIResponseResult,
  IAIResponseService,
} from "./AIResponseService.js"

export { AIResponseService } from "./AIResponseService.js"

// ChatConfigService больше не используется напрямую — используем ChatSettingsService через адаптер

// Экспорт интерфейсов из ChatContextManager
export type {
  ChatContext,
} from "./ChatContextManager.js"

export { ChatContextManager } from "./ChatContextManager.js"
export { ChatQueueManager } from "../../helpers/ai/ChatQueueManager.js"
// Экспорт интерфейсов из MessageProcessor
export type {
  BotMentionResult,
  ContextualMessage,
  IMessageProcessor,
} from "./MessageProcessor.js"
export { MessageProcessor } from "./MessageProcessor.js"
// Экспорт интерфейсов из MessageQueue
export type {
  MessageQueueItem,
} from "../../helpers/ai/MessageQueue.js"
export { MessageQueue } from "../../helpers/ai/MessageQueue.js"
// Экспорт интерфейсов из провайдеров
export type {
  IAIProvider,
} from "./providers/IAIProvider.js"
// Экспорт интерфейсов из TypingManager
export type {
  ITypingManager,
  TypingState,
} from "../../helpers/ai/TypingManager.js"

export { TypingManager } from "../../helpers/ai/TypingManager.js"

/**
 * Базовый интерфейс для всех сервисов AIChatService
 */
// удалены устаревшие фабрики/конфиги

export interface ProcessMessageResult {
  success: boolean
  message?: string
  error?: string
  queued?: boolean
  reason?: string
  queuePosition?: number
}

// Минимальный контракт конфиг-сервиса, используемый AIChatService
export interface IChatConfigService {
  loadAllChatSettings: () => Promise<void>
  isAiEnabledForChat: (chatId: number) => Promise<boolean>
  getApiKeyForChat: (chatId: number) => Promise<{ key: string } | null>
  getSystemPromptForChat: (chatId: number) => Promise<string>
}

// (interfaces re-exported above; keep single source of truth)

// NEW: Ports
export interface AIChatActionsPort {
  sendTyping: (chatId: number) => Promise<void>
  sendMessage: (chatId: number, text: string, replyToMessageId?: number) => Promise<void>
  sendGroupMessage: (chatId: number, text: string, autoDeleteMs?: number) => Promise<void>
  getBotInfo?: () => Promise<{ id: number, username?: string } | null>
}

export interface AIChatRepositoryPort {
  isAiEnabledForChat: (chatId: number) => Promise<boolean>
  getApiKeyForChat: (chatId: number) => Promise<{ key: string } | null>
  getSystemPromptForChat: (chatId: number) => Promise<string>
}