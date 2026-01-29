import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { ChatConfig, ChatConfigPort } from "../../ports/ChatConfigPort.js"

export class ChatRepositoryAdapter implements ChatConfigPort {
  private readonly chatRepository: ChatRepository
  private readonly cache = new Map<number, { value: ChatConfig | null, ts: number }>()
  private static readonly CACHE_TTL_MS = 5_000

  constructor(chatRepository: ChatRepository) {
    this.chatRepository = chatRepository
  }

  async getChatConfig(chatId: number): Promise<ChatConfig | null> {
    const now = Date.now()
    const cached = this.cache.get(chatId)
    if (cached && now - cached.ts < ChatRepositoryAdapter.CACHE_TTL_MS) {
      return cached.value
    }

    const config = await this.chatRepository.getChatConfig(chatId)
    if (!config) {
      this.cache.set(chatId, { value: null, ts: now })
      return null
    }

    const normalized: ChatConfig = {
      chatId,
      geminiApiKey: config.geminiApiKey ?? undefined,
      groupAgentEnabled: (config as any).groupAgentEnabled ?? config.aiEnabled ?? true,
    }

    this.cache.set(chatId, { value: normalized, ts: now })
    return normalized
  }

  isAdmin(chatId: number, userId: number): Promise<boolean> {
    return this.chatRepository.isAdmin(chatId, userId)
  }

  async getChatAdmins(chatId: number): Promise<number[]> {
    const admins = await this.chatRepository.getChatAdmins(chatId)
    return admins.map(admin => admin.userId)
  }
}
