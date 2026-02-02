import type { BufferedMessage } from "../domain/Message.js"
import type { StoredHistoryEntry } from "../domain/Batch.js"
import type { PromptContext } from "../domain/PromptContract.js"

export interface ContextBuilderPort {
  buildContext: (input: {
    chatId: number
    messages: BufferedMessage[]
    history: StoredHistoryEntry[]
  }) => Promise<PromptContext>
}
