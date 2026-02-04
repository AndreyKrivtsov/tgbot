import type { StoredHistoryEntry } from "../domain/Batch.js"

export interface HistoryReducerPort {
  reduce: (entries: StoredHistoryEntry[], maxChars?: number) => StoredHistoryEntry[]
}
