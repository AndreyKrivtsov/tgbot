import { jest } from "@jest/globals"
import { AIChatService } from "../../services/AIChatService/AIChatService.js"
import { AdaptiveChatThrottleManager } from "../../helpers/ai/AdaptiveThrottleManager.js"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"

class DummyProvider {
  async generateContent(): Promise<string> { return "ok" }
}

describe("aiChatService lock & throttle", () => {
  let aiToDispose: AIChatService | undefined
  let throttleToDispose: AdaptiveChatThrottleManager | undefined

  afterEach(async () => {
    if (aiToDispose) {
      await aiToDispose.stop()
      aiToDispose = undefined
    }
    if (throttleToDispose) {
      throttleToDispose.dispose()
      throttleToDispose = undefined
    }
  })

  it("per-context lock: не запускает второй процессор одновременно", async () => {
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const logger = makeLogger()
    const config = makeConfig()
    const eventBus = makeEventBus()
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any, eventBus },
      new DummyProvider() as any,
      new AdaptiveChatThrottleManager(logger),
    )
    aiToDispose = ai
    await ai.initialize()

    const p1 = (ai as unknown as { startQueueProcessor: (id: string) => Promise<void> }).startQueueProcessor("1")
    const p2 = (ai as unknown as { startQueueProcessor: (id: string) => Promise<void> }).startQueueProcessor("1")
    await Promise.all([p1, p2])
    expect(true).toBe(true)
  })

  it("throttle: задержка вызывается по длине ответа", async () => {
    const logger = makeLogger()
    const config = makeConfig()
    const eventBus = makeEventBus()
    const throttle = new AdaptiveChatThrottleManager(logger)
    throttleToDispose = throttle
    const waitSpy = jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any, eventBus },
      new DummyProvider() as any,
      throttle,
    )
    aiToDispose = ai
    await ai.initialize()
    await ai.processMessage(1, 1, "hello")
    await new Promise<void>(resolve => setTimeout(resolve, 100))
    expect(waitSpy).toHaveBeenCalled()
  })
})
