import type { RedisService } from "../../../RedisService/index.js"
import type { ModerationReviewRecord } from "../../domain/Decision.js"
import type { ReviewStatePort } from "../../ports/ReviewStatePort.js"

const REVIEW_KEY_PREFIX = "group_agent:review"

function buildKey(reviewId: string): string {
  return `${REVIEW_KEY_PREFIX}:${reviewId}`
}

function computeTtl(record: ModerationReviewRecord): number | null {
  const now = Date.now()
  const remainingMs = record.expiresAt - now
  if (remainingMs <= 0) {
    return 0
  }
  return Math.ceil(remainingMs / 1000)
}

export class RedisReviewStateAdapter implements ReviewStatePort {
  constructor(private readonly redis: RedisService) {}

  async create(record: ModerationReviewRecord): Promise<void> {
    const key = buildKey(record.id)
    const ttl = computeTtl(record)
    if (ttl === null || ttl <= 0) {
      return
    }
    await this.redis.set(key, record, ttl)
  }

  async get(reviewId: string): Promise<ModerationReviewRecord | null> {
    return await this.redis.get<ModerationReviewRecord>(buildKey(reviewId))
  }

  async save(record: ModerationReviewRecord): Promise<void> {
    const key = buildKey(record.id)
    const ttl = computeTtl(record)
    if (ttl === null || ttl <= 0) {
      await this.redis.del(key)
      return
    }
    await this.redis.set(key, record, ttl)
  }

  async delete(reviewId: string): Promise<void> {
    await this.redis.del(buildKey(reviewId))
  }
}
