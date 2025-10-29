import type { AIChatRepositoryPort } from "../interfaces.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import { AI_CHAT_CONFIG } from "../../../constants.js"

export class ChatSettingsRepositoryAdapter implements AIChatRepositoryPort {
  private repo: ChatRepository
  constructor(repo: ChatRepository) {
    this.repo = repo
  }

  async isAiEnabledForChat(chatId: number): Promise<boolean> {
    if (!this.repo) {
      console.error("ChatRepository is not initialized")
      return false
    }
    const config = await this.repo.getChatConfig(chatId)
    return config?.aiEnabled ?? true
  }

  async getApiKeyForChat(chatId: number): Promise<{ key: string } | null> {
    const config = await this.repo.getChatConfig(chatId)
    const key = config?.geminiApiKey || null
    return key ? { key } : null
  }

  async getSystemPromptForChat(chatId: number): Promise<string> {
    const config = await this.repo.getChatConfig(chatId)
    if (config?.systemPrompt) {
      return this.repo.buildSystemPromptString(config.systemPrompt) || AI_CHAT_CONFIG.DEFAULT_SYSTEM_PROMPT
    }
    return AI_CHAT_CONFIG.DEFAULT_SYSTEM_PROMPT
  }
}
