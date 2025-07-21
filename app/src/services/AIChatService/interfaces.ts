/**
 * Экспорт всех интерфейсов для AIChatService
 */

export { AdaptiveChatThrottleManager } from "./AdaptiveThrottleManager.js"

// Экспорт рефакторированного сервиса
export { AIChatServiceRefactored } from "./AIChatServiceRefactored.js"

// Экспорт интерфейсов из AIResponseService
export type {
  AIResponseParams,
  AIResponseResult,
  IAIResponseService,
  ResponseStats,
} from "./AIResponseService.js"

export { AIResponseService } from "./AIResponseService.js"

// Экспорт интерфейсов из ChatConfigService
export type {
  ApiKeyResult,
  ChatSettingsResult,
  ChatSettingsUpdates,
  IChatConfigService,
} from "./ChatConfigService.js"

// Экспорт классов для использования
export { ChatConfigService } from "./ChatConfigService.js"

// Экспорт интерфейсов из ChatContextManager
export type {
  ChatContext,
} from "./ChatContextManager.js"

export { ChatContextManager } from "./ChatContextManager.js"
export { ChatQueueManager } from "./ChatQueueManager.js"
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
} from "./MessageQueue.js"
export { MessageQueue } from "./MessageQueue.js"
// Экспорт интерфейсов из провайдеров
export type {
  IAIProvider,
} from "./providers/IAIProvider.js"
// Экспорт интерфейсов из TypingManager
export type {
  ITypingManager,
  TypingState,
} from "./TypingManager.js"

export { TypingManager } from "./TypingManager.js"

/**
 * Базовый интерфейс для всех сервисов AIChatService
 */
export interface BaseAIService {
  initialize?: () => Promise<void>
  start?: () => Promise<void>
  stop?: () => Promise<void>
  dispose?: () => Promise<void>
  isHealthy?: () => boolean
  getStats?: () => object
}

/**
 * Конфигурация для создания AIChatService
 */
export interface AIChatServiceConfig {
  maxQueueSize?: number
  maxContextMessages?: number
  maxResponseLength?: number
  contextTTL?: number
  typingTimeout?: number
  throttleConfig?: {
    maxDelay?: number
    minDelay?: number
    bucketCapacity?: number
  }
}

/**
 * Фабрика для создания AIChatService с различными конфигурациями
 */
export interface AIChatServiceFactory {
  create: (config: AIChatServiceConfig) => Promise<BaseAIService>
  createWithDefaults: () => Promise<BaseAIService>
}

export interface IService {
  name: string
  initialize: () => Promise<void>
  stop: () => Promise<void>
}

export interface ProcessMessageResult {
  success: boolean
  message?: string
  error?: string
  queued?: boolean
  reason?: string
  queuePosition?: number
}
