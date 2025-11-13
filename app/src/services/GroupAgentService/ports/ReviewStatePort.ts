import type { ModerationReviewRecord } from "../domain/types.js"

export interface ReviewStatePort {
  create: (record: ModerationReviewRecord) => Promise<void>
  get: (reviewId: string) => Promise<ModerationReviewRecord | null>
  save: (record: ModerationReviewRecord) => Promise<void>
  delete: (reviewId: string) => Promise<void>
}
