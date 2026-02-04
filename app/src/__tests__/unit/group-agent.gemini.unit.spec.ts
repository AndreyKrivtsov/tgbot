import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals"
import type { ChatConfigPort } from "../../services/GroupAgentService/ports/ChatConfigPort.js"
import { AIProviderError } from "../../services/GroupAgentService/ports/AIProviderError.js"

const axiosWithProxyMock = jest.fn()

jest.unstable_mockModule("../../helpers/axiosWithProxy.js", () => ({
  axiosWithProxy: axiosWithProxyMock,
}))

const { GeminiAdapter } = await import("../../services/GroupAgentService/infrastructure/adapters/GeminiAdapter.js")

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
    async getChatAdmins() {
      return []
    },
  }

  beforeEach(() => {
    axiosWithProxyMock.mockReset()
  })

  afterEach(() => {
    jest.clearAllMocks()
  })

  it("возвращает текст и usage при успешном ответе", async () => {
    axiosWithProxyMock.mockResolvedValue({
      data: {
        candidates: [
          {
            content: {
              parts: [{
                text: "{\"r\":[{\"mid\":301,\"c\":2,\"rr\":1,\"a\":0,\"t\":\"Привет! Я здесь.\"}]}",
              }],
            },
          },
        ],
        usageMetadata: {
          promptTokenCount: 10,
          totalTokenCount: 20,
        },
      },
    })

    const adapter = new GeminiAdapter(chatConfig)
    const result = await adapter.classifyBatch({
      chatId: -500,
      prompt: "{\"test\":true}",
    })

    expect(result.text).toContain("\"r\"")
    expect(result.usage?.promptTokens).toBe(10)
  })

  it("выбрасывает AIProviderError при ошибке запроса", async () => {
    axiosWithProxyMock.mockRejectedValue(new Error("network error"))

    const adapter = new GeminiAdapter(chatConfig)
    await expect(adapter.classifyBatch({
      chatId: -500,
      prompt: "{\"test\":true}",
    })).rejects.toBeInstanceOf(AIProviderError)
  })

  it("возвращает null текст при отсутствии ответа", async () => {
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
      prompt: "{\"test\":true}",
    })

    expect(result.text).toBeNull()
  })
})


