import type {
  AgentResolution,
  BatchClassificationResult,
  BufferedMessage,
} from "../domain/types.js"
import type { ModerationPolicy } from "../domain/ModerationPolicy.js"
import type { ResponsePolicy } from "../domain/ResponsePolicy.js"

export class DecisionOrchestrator {
  private readonly moderationPolicy: ModerationPolicy
  private readonly responsePolicy: ResponsePolicy

  constructor(moderationPolicy: ModerationPolicy, responsePolicy: ResponsePolicy) {
    this.moderationPolicy = moderationPolicy
    this.responsePolicy = responsePolicy
  }

  buildResolutions(messages: BufferedMessage[], classification: BatchClassificationResult | null): AgentResolution[] {
    if (!classification) {
      return []
    }

    const messageMap = new Map(messages.map(message => [message.messageId, message]))
    const responses = this.responsePolicy.buildResponses(messages, classification.results)
    const responseMap = new Map(responses.map(response => [response.messageId, response]))

    return classification.results.map((result) => {
      const message = messageMap.get(result.messageId) ?? null
      const moderationActions = message ? this.moderationPolicy.evaluate(message, result) : []
      const responseDecision = responseMap.get(result.messageId) ?? null

      return {
        message,
        classification: result,
        moderationActions,
        response: responseDecision,
      }
    })
  }
}
