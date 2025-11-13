import { randomUUID } from "node:crypto"
import type { AgentResolution, ModerationDecision, ModerationReviewRequest } from "../domain/types.js"
import { isReviewableAction } from "../domain/types.js"

export class ReviewRequestBuilder {
  constructor(private readonly reviewTtlSeconds: number) {}

  build(resolutions: AgentResolution[]): ModerationReviewRequest[] {
    const now = Date.now()
    const expiresAt = now + this.reviewTtlSeconds * 1000

    const requests: ModerationReviewRequest[] = []

    for (const resolution of resolutions) {
      if (!resolution.message) {
        continue
      }

      for (const decision of resolution.moderationActions) {
        if (!isReviewableAction(decision.action)) {
          continue
        }

        requests.push({
          id: randomUUID(),
          chatId: resolution.message.chatId,
          decision,
          targetUser: { id: decision.userId },
          reason: decision.text,
          createdAt: now,
          expiresAt,
          promptText: this.buildPromptText(decision),
        })
      }
    }

    return requests
  }

  private buildPromptText(decision: ModerationDecision): string {
    return `Альтрон предлагает ${decision.action} пользователя tg://user?id=${decision.userId}.`
  }
}
