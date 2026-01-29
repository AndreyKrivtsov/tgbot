import type { IncomingGroupMessage } from "../domain/types.js"

export interface ResolvedTarget {
  userId: number
  messageId?: number
}

export interface UserResolverPort {
  resolveTarget: (params: {
    chatId: number
    sourceMessage: IncomingGroupMessage
    aiUserId?: number
    usernameHint?: string
    nameHint?: string
    replyToMessageId?: number
  }) => Promise<ResolvedTarget | null>
}
