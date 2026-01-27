import type {
  BufferedMessage,
  ClassificationType,
  FormattedMessage,
  ModerationActionKind,
} from "./types.js"

const MAX_TEXT_LENGTH = 300

function truncate(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) {
    return text
  }
  const shortened = text.slice(0, MAX_TEXT_LENGTH - 3)
  return `${shortened}...`
}

export function formatMessageForAI(message: BufferedMessage): FormattedMessage {
  return {
    id: message.messageId,
    chatId: message.chatId,
    userId: message.userId,
    text: truncate(message.text),
    timestamp: message.timestamp,
    isAdmin: Boolean(message.isAdmin),
    username: message.username,
    firstName: message.firstName,
  }
}

function escapeContent(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

function escapeAttribute(value: string): string {
  return escapeContent(value).replace(/"/g, "&quot;")
}

interface MessageTagOptions {
  classification?: string
  moderationAction?: string
}

export function formatMessageTag(message: FormattedMessage, options: MessageTagOptions = {}): string {
  const attributes = [
    `chatId="${message.chatId}"`,
    `userId="${message.userId}"`,
    `messageId="${message.id}"`,
    `timestamp="${message.timestamp}"`,
    `isAdmin="${message.isAdmin ? "true" : "false"}"`,
    message.username ? `username="${escapeAttribute(message.username)}"` : null,
    message.firstName ? `firstName="${escapeAttribute(message.firstName)}"` : null,
    options.classification ? `classification="${escapeAttribute(options.classification)}"` : null,
    options.moderationAction ? `moderationAction="${escapeAttribute(options.moderationAction)}"` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")

  const text = escapeContent(message.text)
  return `<message ${attributes}>${text}</message>`
}

export interface ResponseTagInput {
  classification?: ClassificationType
  requiresResponse?: boolean
  actions?: ModerationActionKind[]
  text?: string
}

export function formatResponseTag(input: ResponseTagInput): string | null {
  const { classification, requiresResponse = false, actions = [], text } = input
  if (!classification && actions.length === 0 && !text && !requiresResponse) {
    return null
  }

  const attributes = [
    classification ? `classification="${escapeAttribute(classification)}"` : null,
    actions.length > 0 ? `actions="${escapeAttribute(actions.join(","))}"` : null,
    `requiresResponse="${requiresResponse ? "true" : "false"}"`,
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")

  const payload = text ? escapeContent(text) : ""
  return `<response${attributes ? ` ${attributes}` : ""}>${payload}</response>`
}
