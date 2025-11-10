export function decisionsToViolations(
  decisions: { id: string, reason: string, action: string }[],
): { messageId: number, reason: string, action: "warn" | "mute" | "kick" | "ban" }[] {
  return decisions
    .map(d => ({ messageId: Number(d.id), reason: d.reason, action: d.action as any }))
    .filter(v => ["warn", "mute", "kick", "ban"].includes(v.action))
}


