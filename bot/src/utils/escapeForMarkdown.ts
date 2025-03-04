export function escapeForMarkdown(chars: string) {
  if (!chars) {
    return ""
  }

  let escapedText = chars.replaceAll("\\", "\\\\").replaceAll(/\*\*/g, "_")
  let index = 0

  const symbols = [
    { symbol: "`", pos: -1 },
    { symbol: "*", pos: -1 },
    { symbol: "_", pos: -1 },
  ]

  for (const char of escapedText) {
    symbols.forEach((s) => {
      if (char === s.symbol) {
        if (s.pos === -1) {
          s.pos = index
        } else {
          s.pos = -1
        }
      }
    })

    index++
  }

  symbols.forEach((s) => {
    if (s.pos > -1) {
      escapedText = `${escapedText.substring(0, s.pos)}\\${escapedText.substring(s.pos, escapedText.length)}`
    }
  })

  return escapedText
    .replaceAll(/#\s*/g, "")
    .replaceAll(".", "\\.")
    .replaceAll("!", "\\!")
    .replaceAll("-", "\\-")
    .replaceAll("~", "\\~")
    .replaceAll("+", "\\+")
    .replaceAll("=", "\\=")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)")
    .replaceAll("[", "\\[")
    .replaceAll("]", "\\]")
}
