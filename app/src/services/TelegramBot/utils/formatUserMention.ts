import type { TelegramUser } from "../types/index.ts"

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

export function formatUserMentionWithCut(user: TelegramUser): string {
  const firstName = user.firstName || "unk"
  let displayName = firstName
  if (displayName.length > 10) {
    displayName = `${displayName.substring(0, 10)}...`
  }

  let displayUsername = user.username
  if (displayUsername && displayUsername.length > 10) {
    displayUsername = `${displayUsername.substring(0, 10)}...`
  }

  displayName = escapeHtml(displayName)

  if (user.username) {
    return `<a href="https://t.me/${user.username}">@${displayUsername}</a>`
  } else {
    return `<a href="tg://user?id=${user.id}">${displayName}</a>`
  }
} 