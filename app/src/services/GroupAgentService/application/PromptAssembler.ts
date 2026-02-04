import type { PromptBuilderPort } from "../ports/PromptBuilderPort.js"
import type { StoredHistoryEntry } from "../domain/Batch.js"
import type { CompactMessage, PromptBuildInput } from "../domain/PromptContract.js"
import type { BufferedMessage } from "../domain/Message.js"
import { formatMessageForAI } from "../domain/MessageFormatter.js"
import type { HistoryToPromptMapper } from "./HistoryToPromptMapper.js"

export class PromptAssembler {
  private readonly promptBuilder: PromptBuilderPort
  private readonly historyMapper: HistoryToPromptMapper

  constructor(promptBuilder: PromptBuilderPort, historyMapper: HistoryToPromptMapper) {
    this.promptBuilder = promptBuilder
    this.historyMapper = historyMapper
  }

  buildPrompt(input: {
    system: PromptBuildInput["system"]
    context: PromptBuildInput["context"]
    history: StoredHistoryEntry[]
    messages: BufferedMessage[]
  }): string {
    const historyEntries = input.history.length > 0
      ? this.historyMapper.map(input.history)
      : undefined

    return this.promptBuilder.buildPrompt({
      system: input.system,
      context: input.context,
      messages: this.mapMessages(input.messages),
      history: historyEntries,
    })
  }

  private mapMessages(messages: BufferedMessage[]): CompactMessage[] {
    return messages.map((message) => {
      const formatted = formatMessageForAI(message)
      const reply = formatted.replyToMessageId && formatted.replyToUserId
        ? { mid: formatted.replyToMessageId, uid: formatted.replyToUserId }
        : undefined

      return {
        id: formatted.id,
        u: formatted.userId,
        a: formatted.isAdmin ? 1 : 0,
        t: formatted.text,
        ...(formatted.username ? { un: formatted.username } : {}),
        ...(reply ? { r: reply } : {}),
      }
    })
  }
}
