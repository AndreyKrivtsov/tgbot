import type {
  AgentInstructions,
  BatchClassificationResult,
  BufferedMessage,
  HistoryEntry,
} from "../domain/types.js"

export interface AIProviderPort {
  classifyBatch(input: {
    chatId: number
    history: HistoryEntry[]
    messages: BufferedMessage[]
    instructions: AgentInstructions
  }): Promise<BatchClassificationResult | null>
}


