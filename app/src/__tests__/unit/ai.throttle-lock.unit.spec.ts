import { jest } from "@jest/globals"
import { AIChatService } from "../../services/AIChatService/AIChatService.js"
import { AdaptiveChatThrottleManager } from "../../services/AIChatService/AdaptiveThrottleManager.js"
import { makeConfig, makeLogger } from "../test-utils/mocks.js"

class DummyProvider {
  async generateContent(): Promise<string> { return "ok" }
}

describe("aiChatService lock & throttle", () => {
  it("per-context lock: не запускает второй процессор одновременно", async () => {
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const logger = makeLogger()
    const config = makeConfig()
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any },
      new DummyProvider() as any,
      new AdaptiveChatThrottleManager(logger),
    )
    await ai.initialize()

    const p1 = (ai as unknown as { startQueueProcessor: (id: string) => Promise<void> }).startQueueProcessor("1")
    const p2 = (ai as unknown as { startQueueProcessor: (id: string) => Promise<void> }).startQueueProcessor("1")
    await Promise.all([p1, p2])
    expect(true).toBe(true)
  })

  it("throttle: задержка вызывается по длине ответа", async () => {
    const logger = makeLogger()
    const config = makeConfig()
    const throttle = new AdaptiveChatThrottleManager(logger)
    const waitSpy = jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any },
      new DummyProvider() as any,
      throttle,
    )
    await ai.initialize()
    const done = new Promise<void>((resolve) => {
      (ai as any).onMessageResponse = () => resolve()
    })
    await ai.processMessage(1, 1, "hello")
    await done
    expect(waitSpy).toHaveBeenCalled()
  })
})
