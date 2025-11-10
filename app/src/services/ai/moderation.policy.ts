import { AI_MODERATION_CONFIG } from "../../constants.js"

export function getSystemPrompt(): string {
  return AI_MODERATION_CONFIG.SYSTEM_PROMPT
}

export function getModel(): string {
  return "gemini-1.5-pro"
}

export function getDefaultModerationConfig(): { temperature: number, maxOutputTokens: number } {
  return { temperature: 0.3, maxOutputTokens: 2000 }
}


