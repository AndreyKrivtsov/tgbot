import type { StoredDecision, StoredHistoryEntry } from "../domain/Batch.js"
import type { CompactHistoryEntry } from "../domain/PromptContract.js"
import { formatMessageForAI } from "../domain/MessageFormatter.js"

export class HistoryToPromptMapper {
  map(entries: StoredHistoryEntry[]): CompactHistoryEntry[] {
    return entries.map(entry => ({
      id: entry.message.messageId,
      u: entry.sender === "bot" ? 0 : entry.message.userId,
      a: entry.sender === "bot" ? 0 : (entry.message.isAdmin ? 1 : 0),
      t: formatMessageForAI(entry.message).text,
      ...(entry.sender !== "bot" && entry.message.username ? { un: entry.message.username } : {}),
      c: this.mapClassification(entry.decision?.classification),
      ac: this.mapActions(entry.decision?.actions),
    }))
  }

  private mapClassification(type?: StoredDecision["classification"]): number | undefined {
    if (!type) {
      return undefined
    }
    switch (type) {
      case "violation":
        return 1
      case "bot_mention":
        return 2
      default:
        return 0
    }
  }

  private mapActions(actions?: StoredDecision["actions"]): number | undefined {
    if (!actions || actions.length === 0) {
      return undefined
    }

    const action = actions[0]
    switch (action) {
      case "warn":
        return 1
      case "delete":
        return 2
      case "mute":
        return 3
      case "unmute":
        return 4
      case "kick":
        return 5
      case "ban":
        return 6
      case "unban":
        return 7
      default:
        return 0
    }
  }
}
