import type { FormattedMessage, IncomingGroupMessage } from "./Message.js"

const MAX_TEXT_LENGTH = 300

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text
  }
  const shortened = text.slice(0, MAX_TEXT_LENGTH - 3)
  return `${shortened}...`
}

export function formatMessageForAI(message: IncomingGroupMessage): FormattedMessage {
  return {
    id: message.messageId,
    chatId: message.chatId,
    userId: message.userId,
    text: truncate(message.text),
    timestamp: message.timestamp,
    isAdmin: Boolean(message.isAdmin),
    username: message.username,
    firstName: message.firstName,
    replyToMessageId: message.replyToMessageId,
    replyToUserId: message.replyToUserId,
  }
}
