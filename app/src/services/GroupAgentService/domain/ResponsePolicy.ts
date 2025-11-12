import type {
  AgentResponseDecision,
  BufferedMessage,
  ClassificationResult,
  ClassificationType,
} from "./types.js"

export interface ResponsePolicyOptions {
  maxResponseLength: number
  priorities?: ClassificationType[]
}

const DEFAULT_PRIORITIES: ClassificationType[] = ["bot_mention", "normal"]

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
  private readonly priorities: ClassificationType[]
  private readonly priorityMap: Map<ClassificationType, number>

  constructor(options: ResponsePolicyOptions) {
    this.maxResponseLength = options.maxResponseLength
    this.priorities = options.priorities && options.priorities.length > 0 ? options.priorities : DEFAULT_PRIORITIES
    this.priorityMap = new Map(this.priorities.map((type, index) => [type, index]))
  }

  selectResponse(messages: BufferedMessage[], results: ClassificationResult[]): AgentResponseDecision | null {
    const candidates = results
      .filter(result => result.classification.requiresResponse && result.responseText)
      .sort((a, b) => this.priorityOf(a.classification.type) - this.priorityOf(b.classification.type))

    const chosen = candidates[0]
    if (!chosen || !chosen.responseText) {
      return null
    }

    const sourceMessage = messages.find(message => message.messageId === chosen.messageId)
    const replyTo = sourceMessage?.replyToMessageId ?? sourceMessage?.messageId

    return {
      messageId: chosen.messageId,
      chatId: sourceMessage?.chatId ?? messages[0]?.chatId ?? 0,
      text: truncate(chosen.responseText, this.maxResponseLength),
      replyToMessageId: replyTo,
    }
  }

  private priorityOf(type: ClassificationType): number {
    return this.priorityMap.get(type) ?? this.priorities.length
  }
}
