import type { HistoryReducerPort } from "../ports/HistoryReducerPort.js"
import type { StoredHistoryEntry } from "../domain/Batch.js"
import type { HistoryToPromptMapper } from "./HistoryToPromptMapper.js"

export interface HistoryReducerConfig {
  dedupe: boolean
}

export class HistoryReducer implements HistoryReducerPort {
  private readonly config: HistoryReducerConfig
  private readonly mapper: HistoryToPromptMapper

  constructor(config: HistoryReducerConfig, mapper: HistoryToPromptMapper) {
    this.config = config
    this.mapper = mapper
  }

  reduce(entries: StoredHistoryEntry[], maxChars: number = Number.POSITIVE_INFINITY): StoredHistoryEntry[] {
    if (entries.length === 0) {
      return []
    }

    const deduped = this.config.dedupe ? this.dedupe(entries) : entries
    if (maxChars <= 0) {
      return []
    }

    const limited: StoredHistoryEntry[] = []
    let totalChars = 2

    for (let i = deduped.length - 1; i >= 0; i -= 1) {
      const entry = deduped[i]
      if (!entry) {
        continue
      }

      const entryChars = this.estimateEntryChars(entry)
      const nextChars = totalChars + entryChars + (limited.length > 0 ? 1 : 0)
      if (nextChars > maxChars) {
        if (limited.length === 0) {
          limited.push(entry)
        }
        break
      }

      limited.push(entry)
      totalChars = nextChars
    }

    return limited.reverse()
  }

  private dedupe(entries: StoredHistoryEntry[]): StoredHistoryEntry[] {
    const seen = new Set<string>()
    const deduped: StoredHistoryEntry[] = []

    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const entry = entries[i]
      if (!entry) {
        continue
      }
      const key = this.buildKey(entry)
      if (!seen.has(key)) {
        seen.add(key)
        deduped.push(entry)
      }
    }

    return deduped.reverse()
  }

  private buildKey(entry: StoredHistoryEntry): string {
    const parts = [
      entry.sender,
      entry.message.userId,
      entry.message.text,
      entry.decision?.classification ?? "",
      entry.decision?.actions?.join(",") ?? "",
      entry.decision?.responseText ?? "",
    ]
    return parts.join("|")
  }

  private estimateEntryChars(entry: StoredHistoryEntry): number {
    const mapped = this.mapper.map([entry])[0]
    if (!mapped) {
      return 0
    }
    return JSON.stringify(mapped).length
  }
}
