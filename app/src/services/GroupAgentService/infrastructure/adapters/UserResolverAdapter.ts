import type { ResolvedTarget, UserResolverPort } from "../../ports/UserResolverPort.js"
import type { IncomingGroupMessage } from "../../domain/types.js"

export class UserResolverAdapter implements UserResolverPort {
  async resolveTarget(params: {
    chatId: number
    sourceMessage: IncomingGroupMessage
    aiUserId?: number
    usernameHint?: string
    nameHint?: string
    replyToMessageId?: number
  }): Promise<ResolvedTarget | null> {
    const { aiUserId, sourceMessage } = params

    if (typeof aiUserId === "number") {
      return { userId: aiUserId, messageId: params.replyToMessageId }
    }

    if (sourceMessage.replyToUserId) {
      return {
        userId: sourceMessage.replyToUserId,
        messageId: sourceMessage.replyToMessageId,
      }
    }

    return { userId: sourceMessage.userId, messageId: sourceMessage.replyToMessageId }
  }
}
