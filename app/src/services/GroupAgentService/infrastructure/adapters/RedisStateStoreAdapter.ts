import type { RedisService } from "../../../RedisService/index.js"
import { GROUP_AGENT_CONFIG } from "../../../../constants.js"
import type { StateStorePort } from "../../ports/StateStorePort.js"
import type { BufferState, ChatHistory } from "../../domain/types.js"

const HISTORY_PREFIX = "group_agent:history"
const BUFFER_PREFIX = "group_agent:buffer"

const historyKey = (chatId: number): string => `${HISTORY_PREFIX}:${chatId}`
const bufferKey = (chatId: number): string => `${BUFFER_PREFIX}:${chatId}`

export class RedisStateStoreAdapter implements StateStorePort {
  private readonly redis: RedisService

  constructor(redis: RedisService) {
    this.redis = redis
  }

  async loadHistory(chatId: number): Promise<ChatHistory | null> {
    return await this.redis.get<ChatHistory>(historyKey(chatId))
  }

  async saveHistory(history: ChatHistory): Promise<void> {
    await this.redis.set(
      historyKey(history.chatId),
      history,
    )
  }

  async loadBuffers(): Promise<BufferState[]> {
    const keys = await this.redis.keys(`${BUFFER_PREFIX}:*`)
    if (!keys || keys.length === 0) {
      return []
    }

    const buffers: BufferState[] = []
    for (const key of keys) {
      const data = await this.redis.get<BufferState>(key)
      if (data) {
        buffers.push(data)
      }
    }

    return buffers
  }

  async saveBuffers(buffers: BufferState[]): Promise<void> {
    const seen = new Set<string>()
    for (const buffer of buffers) {
      const key = bufferKey(buffer.chatId)
      seen.add(key)
      await this.redis.set(key, buffer, GROUP_AGENT_CONFIG.BUFFER_TTL_SECONDS)
    }

    const keys = await this.redis.keys(`${BUFFER_PREFIX}:*`)
    for (const key of keys) {
      if (!seen.has(key)) {
        await this.redis.del(key)
      }
    }
  }
}
