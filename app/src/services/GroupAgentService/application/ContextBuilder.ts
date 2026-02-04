import type { ContextBuilderPort } from "../ports/ContextBuilderPort.js"
import type { ChatConfigPort } from "../ports/ChatConfigPort.js"
import type { PromptContext } from "../domain/PromptContract.js"
import type { StoredHistoryEntry } from "../domain/Batch.js"
import type { BufferedMessage } from "../domain/Message.js"

interface UserStats {
  warns: number
  mutedUntil: number | null
}

export class ContextBuilder implements ContextBuilderPort {
  private readonly chatConfig: ChatConfigPort

  constructor(chatConfig: ChatConfigPort) {
    this.chatConfig = chatConfig
  }

  async buildContext(input: {
    chatId: number
    messages: BufferedMessage[]
    history: StoredHistoryEntry[]
  }): Promise<PromptContext> {
    let admins: number[] = []
    try {
      admins = await this.chatConfig.getChatAdmins(input.chatId)
    } catch {
      admins = []
    }
    const userStats = this.buildUserStats(input.history, input.messages)

    return {
      admins,
      flags: {},
      userStats,
    }
  }

  private buildUserStats(history: StoredHistoryEntry[], messages: BufferedMessage[]): Record<string, UserStats> {
    const stats = new Map<number, UserStats>()

    for (const entry of history) {
      if (entry.sender === "bot") {
        continue
      }
      const userId = entry.message.userId
      if (!stats.has(userId)) {
        stats.set(userId, { warns: 0, mutedUntil: null })
      }
      const current = stats.get(userId)!
      if (entry.decision?.actions?.includes("warn")) {
        current.warns += 1
      }
    }

    for (const message of messages) {
      if (!stats.has(message.userId)) {
        stats.set(message.userId, { warns: 0, mutedUntil: null })
      }
    }

    return Object.fromEntries(
      Array.from(stats.entries()).map(([userId, data]) => [String(userId), data]),
    )
  }
}
