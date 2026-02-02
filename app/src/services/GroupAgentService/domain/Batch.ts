import type { BufferedMessage, IncomingGroupMessage } from "./Message.js"
import type { ClassificationResult, ClassificationType, ModerationActionKind } from "./Decision.js"

export interface BatchUsageMetadata {
  promptTokens?: number
  totalTokens?: number
  modelVersion?: string
}

export interface BatchClassificationResult {
  results: ClassificationResult[]
  usage?: BatchUsageMetadata
}

export interface StoredDecision {
  classification?: ClassificationType
  requiresResponse?: boolean
  actions?: ModerationActionKind[]
  responseText?: string
  targetUserId?: number
  targetMessageId?: number
  durationMinutes?: number
}

export interface StoredHistoryEntry {
  message: IncomingGroupMessage
  sender: "user" | "bot"
  decision?: StoredDecision
  timestamp: number
}

export interface StoredChatHistory {
  chatId: number
  entries: StoredHistoryEntry[]
}

export interface BufferState {
  chatId: number
  messages: BufferedMessage[]
  updatedAt: number
}
