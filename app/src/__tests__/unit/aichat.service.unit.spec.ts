import { jest } from "@jest/globals"
import { AIChatService } from "../../services/AIChatService/AIChatService.js"
import { AdaptiveChatThrottleManager } from "../../helpers/ai/AdaptiveThrottleManager.js"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"

class DummyProvider {
  async generateContent(): Promise<string> { return "ok" }
}

describe("aIChatService basic flows", () => {
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

  it("returns queued and emits response when AI enabled and key exists", async () => {
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const logger = makeLogger()
    const config = makeConfig()
    const eventBus = makeEventBus()
    const throttle = new AdaptiveChatThrottleManager(logger)
    throttleToDispose = throttle
    jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any, eventBus },
      new DummyProvider() as any,
      throttle,
    )
    aiToDispose = ai
    await ai.initialize()

    const done = new Promise<void>((resolve) => {
      // Перехватываем событие AI_RESPONSE
      eventBus.onAIResponse = jest.fn((handler: any) => {
        handler({ contextId: "1", response: "ok" })
        resolve()
      })
    })

    const res = await ai.processMessage(1, 1, "hello")
    expect(res).toEqual({ success: true, queued: true, queuePosition: 1 })

    // Проверяем, что было вызвано emitAIResponse
    await new Promise<void>(resolve => setTimeout(resolve, 100))
    expect((eventBus as any).emitAIResponse).toHaveBeenCalled()
  })

  it("returns not queued when AI disabled", async () => {
    const repo = {
      isAiEnabledForChat: async () => false,
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

    const res = await ai.processMessage(1, 1, "hello")
    expect(res.success).toBe(false)
    expect(res.queued).toBe(false)
    expect(res.reason).toMatch(/AI отключен/i)
  })

  it("returns not queued when API key missing", async () => {
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => null,
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

    const res = await ai.processMessage(1, 1, "hello")
    expect(res.success).toBe(false)
    expect(res.queued).toBe(false)
    expect(res.reason).toMatch(/API ключ не найден/i)
  })

  it("respects MAX_QUEUE_SIZE and returns reason when exceeded", async () => {
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const logger = makeLogger()
    const config = makeConfig()
    const eventBus = makeEventBus()
    class SlowProvider {
      async generateContent(): Promise<string> {
        await new Promise(r => setTimeout(r, 50))
        return "ok"
      }
    }
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any, eventBus },
      new SlowProvider() as any,
      new AdaptiveChatThrottleManager(logger),
    )
    aiToDispose = ai
    await ai.initialize()
    // Блокируем автопроцессор, чтобы очередь не опустошалась
    ;(ai as any).startQueueProcessor = jest.fn()

    // Заполняем очередь до лимита
    const promises: Array<Promise<any>> = []
    for (let i = 0; i < 10; i++) {
      promises.push(ai.processMessage(1, 1, `m${i}`))
    }
    await Promise.all(promises)

    // Следующее сообщение должно быть отклонено
    const res = await ai.processMessage(1, 1, "overflow")
    expect(res.success).toBe(false)
    expect(res.queued).toBe(false)
    expect(res.reason).toMatch(/Слишком много сообщений в очереди/i)
  })

  it("stops typing after processing (finally)", async () => {
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const logger = makeLogger()
    const config = makeConfig()
    const eventBus = makeEventBus()
    const throttle = new AdaptiveChatThrottleManager(logger)
    throttleToDispose = throttle
    jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any, eventBus },
      new DummyProvider() as any,
      throttle,
    )
    aiToDispose = ai
    await ai.initialize()

    // Перехватим TypingManager
    const stopSpy = jest.spyOn((ai as any).typingManager, "stopTyping")
    await ai.processMessage(1, 1, "hello")
    // Даем циклу finally выполниться
    await new Promise<void>(resolve => setTimeout(resolve, 100))
    expect(stopSpy).toHaveBeenCalled()
  })

  it("on provider error emits error response", async () => {
    class FailingProvider {
      async generateContent(): Promise<string> {
        throw new Error("provider failed")
      }
    }
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const logger = makeLogger()
    const config = makeConfig()
    const eventBus = makeEventBus()
    const throttle = new AdaptiveChatThrottleManager(logger)
    throttleToDispose = throttle
    jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any, eventBus },
      new FailingProvider() as any,
      throttle,
    )
    aiToDispose = ai
    await ai.initialize()

    await ai.processMessage(1, 1, "hello")

    // Даем время на обработку ошибки
    await new Promise<void>(resolve => setTimeout(resolve, 100))

    // Проверяем, что было вызвано emitAIResponse с ошибкой
    expect((eventBus as any).emitAIResponse).toHaveBeenCalledWith(expect.objectContaining({
      isError: true,
    }))
  })
})
