import { AI_CHAT_CONFIG } from "../../constants.js"

export function getChatModel(): string {
  return "gemma-3-27b-it"
}

export function getChatGenerationLimits(): { maxTokens: number, temperature: number } {
  return { maxTokens: AI_CHAT_CONFIG.MAX_RESPONSE_LENGTH, temperature: 1.8 }
}

export function getMaxContextMessages(): number {
  return AI_CHAT_CONFIG.MAX_CONTEXT_MESSAGES
}
