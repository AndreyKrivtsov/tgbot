export interface IncomingGroupMessage {
  messageId: number
  chatId: number
  userId: number
  text: string
  timestamp: number
  username?: string
  firstName?: string
  isAdmin?: boolean
  replyToMessageId?: number
  replyToUserId?: number
}

export interface BufferedMessage extends IncomingGroupMessage {
  processed?: boolean
}

export interface FormattedMessage {
  id: number
  chatId: number
  userId: number
  text: string
  timestamp: number
  isAdmin: boolean
  username?: string
  firstName?: string
  replyToMessageId?: number
  replyToUserId?: number
}
