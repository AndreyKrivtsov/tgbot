export type ChatMessageRole = "system" | "user" | "model"

export interface ChatMessage {
  role: ChatMessageRole
  content: string
}

export interface ChatRequest {
  chatId: number | string
  messages: ChatMessage[]
  systemPrompt: string
  model: string
  maxTokens: number
  temperature: number
  apiKey: string
}

export interface ChatResponse {
  content: string
}

export interface ModerationDecision {
  id: string
  action: "allow" | "warn" | "mute" | "kick" | "ban" | "delete"
  reason: string
}

export interface ModerationBatchRequest {
  chatId: number | string
  prompt: string
  model: string
  apiKey: string
}

export interface ModerationBatchResponse {
  decisions: ModerationDecision[]
}

export interface LLMPort {
  generateChatResponse: (input: ChatRequest) => Promise<ChatResponse>
  moderateBatch: (input: ModerationBatchRequest) => Promise<ModerationBatchResponse>
}
