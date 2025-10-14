import type { AIChatRepositoryPort } from "../interfaces.js"
import type { ChatSettingsService } from "../../ChatSettingsService/index.js"

export class ChatSettingsRepositoryAdapter implements AIChatRepositoryPort {
  private svc: ChatSettingsService
  constructor(svc: ChatSettingsService) {
    this.svc = svc
  }

  async isAiEnabledForChat(chatId: number): Promise<boolean> {
    return await this.svc.isAiEnabled(chatId)
  }

  async getApiKeyForChat(chatId: number): Promise<{ key: string } | null> {
    const key = await this.svc.getApiKey(chatId)
    return key ? { key } : null
  }

  async getSystemPromptForChat(chatId: number): Promise<string> {
    return await this.svc.getSystemPromptText(chatId)
  }
}


