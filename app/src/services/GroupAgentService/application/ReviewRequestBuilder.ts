import { randomUUID } from "node:crypto"
import type { AgentResolution, ModerationDecision, ModerationReviewRequest } from "../domain/Decision.js"
import { isReviewableAction } from "../domain/Decision.js"

export class ReviewRequestBuilder {
  constructor(private readonly reviewTtlSeconds: number) {}

  build(resolutions: AgentResolution[], adminMentions: string[] = []): ModerationReviewRequest[] {
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

        const targetUsername = resolution.message?.userId === decision.userId
          ? resolution.message?.username
          : undefined

        requests.push({
          id: randomUUID(),
          chatId: resolution.message.chatId,
          decision,
          targetUser: {
            id: decision.userId,
            ...(targetUsername ? { username: targetUsername } : {}),
          },
          reason: decision.text,
          createdAt: now,
          expiresAt,
          promptText: this.buildPromptText(decision, adminMentions, targetUsername),
        })
      }
    }

    return requests
  }

  private buildPromptText(
    decision: ModerationDecision,
    adminMentions: string[],
    targetUsername?: string,
  ): string {
    const target = targetUsername ? `@${targetUsername}` : `tg://openmessage?user_id=${decision.userId}`
    const base = `Альтрон предлагает ${decision.action} пользователя ${target}.`
    if (adminMentions.length === 0) {
      return base
    }
    return `${base}\n\nАдмины: ${adminMentions.join(" ")}`
  }
}
