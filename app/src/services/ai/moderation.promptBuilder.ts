interface WarningHistoryItem { username: string, reason: string }

export function buildModerationPrompt(messages: { id: number, user: string | number, text: string }[], warningHistory: WarningHistoryItem[]): string {
  const msgs = messages.map((m, i) => `[${i + 1}] ID:${m.id} User:${m.user} Text:"${m.text}"`).join("\n")
  const history = warningHistory.length
    ? `\n\nИстория предупреждений за последний час:\n${warningHistory.map(w => `  - ${w.username}: ${w.reason}`).join("\n")}`
    : ""
  return `Сообщения для проверки:\n${msgs}${history}`
}


