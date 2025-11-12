import type { BufferedMessage, FormattedMessage } from "./types.js"

const MAX_TEXT_LENGTH = 300

const pad2 = (value: number): string => value.toString().padStart(2, "0")

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text
  }
  const shortened = text.slice(0, MAX_TEXT_LENGTH - 3)
  return `${shortened}...`
}

export function formatMessageForAI(message: BufferedMessage): FormattedMessage {
  const date = new Date(message.timestamp)
  const time = `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())} ${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`

  const parts: string[] = [`[ID:${message.messageId}]`, `[UID:${message.userId}]`]

  if (message.isAdmin) {
    parts.push("[ADMIN]")
  }

  parts.push(`[${time}]`)

  if (message.username) {
    parts.push(`[@${message.username}]`)
  }

  if (message.firstName) {
    parts.push(`[${message.firstName}]`)
  }

  const formatted = `${parts.join("")}: ${truncate(message.text)}`

  return {
    id: message.messageId,
    chatId: message.chatId,
    text: formatted,
  }
}
