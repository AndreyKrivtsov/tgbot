import type { ResponseParserPort } from "../../ports/ResponseParserPort.js"
import type { BatchClassificationResult } from "../../domain/Batch.js"
import type { ClassificationResult } from "../../domain/Decision.js"

const CLASSIFICATION_TYPES = ["normal", "violation", "bot_mention"] as const
const ACTION_TYPES = ["none", "warn", "delete", "mute", "unmute", "kick", "ban", "unban"] as const

function safeParseJson(text: string): any | null {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    const trimmed = text.trim()
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1)
      try {
        return JSON.parse(candidate)
      } catch {
        return null
      }
    }
    return null
  }
}

export class CompactResponseParser implements ResponseParserPort {
  parse(input: { text: string; allowedMessageIds: Set<number> }): BatchClassificationResult {
    const parsed = safeParseJson(input.text)
    if (!parsed || !Array.isArray(parsed.r)) {
      return { results: [] }
    }

    const results: ClassificationResult[] = []

    for (const item of parsed.r) {
      if (!item || typeof item.mid !== "number" || !input.allowedMessageIds.has(item.mid)) {
        continue
      }

      const classificationType = CLASSIFICATION_TYPES[item.c] ?? "normal"
      const action = ACTION_TYPES[item.a] ?? "none"
      const requiresResponse = Boolean(item.t) || action !== "none"

      const normalized: ClassificationResult = {
        messageId: item.mid,
        classification: {
          type: classificationType,
          requiresResponse,
        },
        moderationAction: action,
        responseText: typeof item.t === "string" ? item.t : undefined,
        targetUserId: typeof item.tu === "number" ? item.tu : undefined,
        targetMessageId: typeof item.tm === "number" ? item.tm : undefined,
        durationMinutes: typeof item.d === "number" && item.d > 0 ? item.d : undefined,
      }

      results.push(normalized)
    }

    return { results }
  }
}
