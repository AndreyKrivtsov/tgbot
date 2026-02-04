import type { BatchUsageMetadata } from "../domain/Batch.js"

export interface AIProviderResult {
  text: string | null
  usage?: BatchUsageMetadata
}

export interface AIProviderPort {
  classifyBatch: (input: {
    chatId: number
    prompt: string
  }) => Promise<AIProviderResult>
}
