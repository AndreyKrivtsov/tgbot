import { AIChatServiceRefactored } from "../../../../services/AIChatService/AIChatServiceRefactored.js"
import { GeminiAdapter } from "../../../../services/AIChatService/providers/GeminiAdapter.js"
import { AdaptiveChatThrottleManager } from "../../../../services/AIChatService/AdaptiveThrottleManager.js"
import type { Logger } from "../../../../helpers/Logger.js"
import type { AppConfig } from "../../../../config.js"

// Mock dependencies
const mockConfig = {
  BOT_TOKEN: "test_token",
  GEMINI_API_KEY: "test_key",
} as unknown as AppConfig

const mockLogger = {
  i: jest.fn(),
  d: jest.fn(),
  w: jest.fn(),
  e: jest.fn(),
} as unknown as Logger

const mockDatabase = {
  // Mock database methods
}

const mockRedis = {
  // Mock redis methods
}

describe("aIChatServiceRefactored", () => {
  let aiChatService: AIChatServiceRefactored
  let geminiAdapter: GeminiAdapter
  let throttleManager: AdaptiveChatThrottleManager

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks()

    // Create instances
    geminiAdapter = new GeminiAdapter()
    throttleManager = new AdaptiveChatThrottleManager(mockLogger)

    aiChatService = new AIChatServiceRefactored(
      mockConfig,
      mockLogger,
      {
        database: mockDatabase as any,
        redis: mockRedis as any,
      },
      geminiAdapter,
      throttleManager,
    )
  })

  describe("initialization", () => {
    it("should initialize successfully", async () => {
      await aiChatService.initialize()
      expect(mockLogger.i).toHaveBeenCalledWith("🤖 Initializing AI chat service (refactored)...")
      expect(mockLogger.i).toHaveBeenCalledWith("✅ AI chat service initialized")
    })

    it("should start successfully", async () => {
      await aiChatService.start()
      expect(mockLogger.i).toHaveBeenCalledWith("🚀 Starting AI chat service (refactored)...")
      expect(mockLogger.i).toHaveBeenCalledWith("✅ AI chat service started")
    })

    it("should stop successfully", async () => {
      await aiChatService.stop()
      expect(mockLogger.i).toHaveBeenCalledWith("🛑 Stopping AI chat service (refactored)...")
      expect(mockLogger.i).toHaveBeenCalledWith("✅ AI chat service stopped")
    })
  })

  describe("health check", () => {
    it("should return healthy when redis is available", () => {
      const result = aiChatService.isHealthy()
      expect(result).toBe(true)
    })

    it("should return unhealthy when redis is unavailable", () => {
      const serviceWithoutRedis = new AIChatServiceRefactored(
        mockConfig,
        mockLogger,
        {
          database: mockDatabase as any,
          // No redis
        },
        geminiAdapter,
        throttleManager,
      )

      const result = serviceWithoutRedis.isHealthy()
      expect(result).toBe(false)
    })
  })

  describe("bot mention detection", () => {
    it("should detect bot mentions", () => {
      const result = aiChatService.isBotMention("@testbot hello", "testbot")
      expect(result).toBe(true)
    })

    it("should detect reply to bot", () => {
      const result = aiChatService.isBotMention("hello", undefined, true)
      expect(result).toBe(true)
    })

    it("should not detect when no mention", () => {
      const result = aiChatService.isBotMention("hello", "testbot")
      expect(result).toBe(false)
    })
  })

  describe("message processing", () => {
    it("should return disabled when AI is disabled", async () => {
      // Mock AI as disabled
      const result = await aiChatService.processMessage(
        123,
        456,
        "test message",
        "testuser",
        "Test User",
      )

      expect(result).toEqual({
        success: false,
        queued: false,
        reason: "AI отключен в этом чате",
      })
    })
  })
})
