import type { AgentResponseDecision, ClassificationResult, ClassificationType } from "./Decision.js"
import type { BufferedMessage } from "./Message.js"

export interface ResponsePolicyOptions {
  maxResponseLength: number
  priorities?: ClassificationType[]
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text
  }
  if (limit <= 3) {
    return text.slice(0, limit)
  }
  return `${text.slice(0, limit - 3)}...`
}

export class ResponsePolicy {
  private readonly maxResponseLength: number

  constructor(options: ResponsePolicyOptions) {
    this.maxResponseLength = options.maxResponseLength
  }

  buildResponses(messages: BufferedMessage[], results: ClassificationResult[]): AgentResponseDecision[] {
    if (results.length === 0) {
      return []
    }

    const messageMap = new Map(messages.map(message => [message.messageId, message]))

    return results
      .filter(result => result.classification.requiresResponse && result.responseText)
      .map((result) => {
        const sourceMessage = messageMap.get(result.messageId) ?? null
        const fallbackChatId = messages[0]?.chatId ?? 0
        const chatId = sourceMessage?.chatId ?? fallbackChatId
        const replyTo = sourceMessage?.replyToMessageId ?? sourceMessage?.messageId

        return {
          messageId: result.messageId,
          chatId,
          text: truncate(result.responseText as string, this.maxResponseLength),
          replyToMessageId: replyTo,
        }
      })
  }
}
