import type { BatchClassificationResult } from "../domain/Batch.js"

export interface ResponseParserPort {
  parse: (input: { text: string; allowedMessageIds: Set<number> }) => BatchClassificationResult
}
