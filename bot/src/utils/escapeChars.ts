export function escapeChars(chars: string) {
  return chars
    .replace(/_/g, "\\_")
    .replace(/-/g, "\\-")
    .replace("~", "\\~")
    .replace(/`/g, "\\`")
    .replace(/\./g, "\\.")
    .replace("[", "\\[")
    .replace("]", "\\]")
}
