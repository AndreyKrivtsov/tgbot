import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { ChatConfigPort, ChatConfig } from "../../ports/ChatConfigPort.js"

export class ChatRepositoryAdapter implements ChatConfigPort {
  private readonly chatRepository: ChatRepository

  constructor(chatRepository: ChatRepository) {
    this.chatRepository = chatRepository
  }

  async getChatConfig(chatId: number): Promise<ChatConfig | null> {
    const config = await this.chatRepository.getChatConfig(chatId)
    if (!config) {
      return null
    }

    return {
      chatId,
      geminiApiKey: config.geminiApiKey ?? undefined,
      groupAgentEnabled: (config as any).groupAgentEnabled ?? true,
    }
  }

  isAdmin(chatId: number, userId: number): Promise<boolean> {
    return this.chatRepository.isAdmin(chatId, userId)
  }
}


