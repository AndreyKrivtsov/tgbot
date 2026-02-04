import type { ChatRepository } from "../../../../repository/ChatRepository.js"
import type { RedisService } from "../../../RedisService/index.js"
import type { AdminMentionsPort } from "../../ports/AdminMentionsPort.js"

export class AdminMentionsAdapter implements AdminMentionsPort {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly redisService: RedisService,
  ) {}

  async getAdminMentions(chatId: number): Promise<string[]> {
    try {
      const admins = await this.chatRepository.getChatAdmins(chatId)
      const botInfo = await this.redisService.getBotInfo()
      const botId = botInfo?.id
      const botUsername = botInfo?.username?.toLowerCase()

      return admins
        .filter((admin) => {
          if (typeof botId === "number" && admin.userId === botId) {
            return false
          }
          if (botUsername && admin.username?.toLowerCase() === botUsername) {
            return false
          }
          return true
        })
        .map(admin => (admin.username ? `@${admin.username}` : null))
        .filter((mention): mention is string => Boolean(mention))
    } catch {
      return []
    }
  }
}
