import { GeminiAdapter } from "../../../../services/AIChatService/providers/GeminiAdapter.js"
import { AI_CHAT_CONFIG } from "../../../../constants.js"

import { axiosWithProxy } from "../../../../helpers/axiosWithProxy.js"

// Мокаем axiosWithProxy
jest.mock("../../../../helpers/axiosWithProxy.js", () => ({
  axiosWithProxy: jest.fn(),
}))

const mockAxiosWithProxy = axiosWithProxy as jest.MockedFunction<typeof axiosWithProxy>

describe("geminiAdapter", () => {
  let geminiAdapter: GeminiAdapter

  beforeEach(() => {
    geminiAdapter = new GeminiAdapter()
    jest.clearAllMocks()
  })

  describe("request with timeout", () => {
    it("should include timeout in axios request config", async () => {
      // Мокаем успешный ответ
      mockAxiosWithProxy.mockResolvedValueOnce({
        status: 200,
        data: {
          candidates: [{
            content: {
              parts: [{ text: "Test response" }],
            },
          }],
        },
      } as any)

      await geminiAdapter.generateContent("test-api-key", "test prompt")

      // Проверяем, что axios был вызван с таймаутом
      expect(mockAxiosWithProxy).toHaveBeenCalledWith(
        expect.objectContaining({
          timeout: AI_CHAT_CONFIG.AI_REQUEST_TIMEOUT_MS,
        }),
      )
    })

    it("should handle timeout errors properly", async () => {
      // Мокаем ошибку таймаута
      const timeoutError = new Error("timeout") as any
      timeoutError.code = "ECONNABORTED"
      mockAxiosWithProxy.mockRejectedValueOnce(timeoutError)

      await expect(
        geminiAdapter.generateContent("test-api-key", "test prompt"),
      ).rejects.toThrow(`Request timeout (${AI_CHAT_CONFIG.AI_REQUEST_TIMEOUT_MS}ms): Gemini API did not respond in time`)
    })

    it("should handle network errors properly", async () => {
      // Мокаем сетевую ошибку
      const networkError = new Error("ECONNREFUSED") as any
      networkError.code = "ECONNREFUSED"
      mockAxiosWithProxy.mockRejectedValueOnce(networkError)

      await expect(
        geminiAdapter.generateContent("test-api-key", "test prompt"),
      ).rejects.toThrow("Network error: Unable to connect to Gemini API")
    })
  })

  describe("parseResponse", () => {
    it("should extract text from valid response", async () => {
      const mockResponse = {
        status: 200,
        data: {
          candidates: [{
            content: {
              parts: [{ text: "Hello from Gemini!" }],
            },
          }],
        },
      }

      mockAxiosWithProxy.mockResolvedValueOnce(mockResponse as any)

      const result = await geminiAdapter.generateContent("test-api-key", "Hello")
      expect(result).toBe("Hello from Gemini!")
    })

    it("should handle API errors in response", async () => {
      const mockResponse = {
        status: 200,
        data: {
          error: {
            message: "API quota exceeded",
            code: 429,
          },
        },
      }

      mockAxiosWithProxy.mockResolvedValueOnce(mockResponse as any)

      await expect(
        geminiAdapter.generateContent("test-api-key", "Hello"),
      ).rejects.toThrow("Gemini API error: API quota exceeded (code: 429)")
    })

    it("should handle empty response", async () => {
      const mockResponse = {
        status: 200,
        data: {
          candidates: [],
        },
      }

      mockAxiosWithProxy.mockResolvedValueOnce(mockResponse as any)

      await expect(
        geminiAdapter.generateContent("test-api-key", "Hello"),
      ).rejects.toThrow("No valid response from Gemini API")
    })
  })
})
