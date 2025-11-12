import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals"
import type { ChatConfigPort } from "../../services/GroupAgentService/ports/ChatConfigPort.js"
import type { AgentInstructions, BufferedMessage, HistoryEntry } from "../../services/GroupAgentService/domain/types.js"
import { DEFAULT_AGENT_INSTRUCTIONS } from "../../services/GroupAgentService/infrastructure/config/defaultInstructions.js"

const axiosWithProxyMock = jest.fn()

jest.unstable_mockModule("../../helpers/axiosWithProxy.js", () => ({
  axiosWithProxy: axiosWithProxyMock,
}))

const { GeminiAdapter } = await import("../../services/GroupAgentService/infrastructure/adapters/GeminiAdapter.js")

const instructions: AgentInstructions = DEFAULT_AGENT_INSTRUCTIONS

const history: HistoryEntry[] = []

const messages: BufferedMessage[] = [
  {
    messageId: 301,
    chatId: -500,
    userId: 55,
    text: "Привет, бот!",
    timestamp: Date.now(),
  },
  {
    messageId: 302,
    chatId: -500,
    userId: 56,
    text: "Спам реклама",
    timestamp: Date.now(),
  },
]

describe("GeminiAdapter", () => {
  const chatConfig: ChatConfigPort = {
    async getChatConfig(chatId: number) {
      return {
        chatId,
        geminiApiKey: "test-key",
        groupAgentEnabled: true,
      }
    },
    async isAdmin() {
      return false
    },
  }

  beforeEach(() => {
    axiosWithProxyMock.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("возвращает нормализованные результаты по допустимым messageId", async () => {
    axiosWithProxyMock.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{
                text: JSON.stringify({
                  results: [
                    {
                      messageId: 301,
                      classification: {
                        type: "bot_mention",
                        requiresResponse: true,
                      },
                      moderationAction: "none",
                      responseText: "Привет! Я здесь.",
                    },
                    {
                      messageId: 999,
                      classification: {
                        type: "violation",
                      },
                      moderationAction: "ban",
                      responseText: "Лишнее сообщение",
                    },
                  ],
                }),
              }],
            },
          },
        ],
      },
    })

    const adapter = new GeminiAdapter(chatConfig)
    const result = await adapter.classifyBatch({
      chatId: -500,
      instructions,
      history,
      messages,
    })

    expect(result).not.toBeNull()
    expect(result?.results).toHaveLength(1)
    expect(result?.results[0]).toMatchObject({
      messageId: 301,
      classification: {
        type: "bot_mention",
        requiresResponse: true,
      },
      responseText: "Привет! Я здесь.",
    })
  })

  it("возвращает null при ошибке Gemini API", async () => {
    axiosWithProxyMock.mockRejectedValue(new Error("network error"))

    const adapter = new GeminiAdapter(chatConfig)
    const result = await adapter.classifyBatch({
      chatId: -500,
      instructions,
      history,
      messages,
    })

    expect(result).toBeNull()
  })

  it("возвращает пустой результат при отсутствии текста", async () => {
    axiosWithProxyMock.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{ text: "" }],
            },
          },
        ],
      },
    })

    const adapter = new GeminiAdapter(chatConfig)
    const result = await adapter.classifyBatch({
      chatId: -500,
      instructions,
      history,
      messages,
    })

    expect(result).toEqual({ results: [] })
  })
})


