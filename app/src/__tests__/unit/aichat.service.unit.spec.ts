import { jest } from "@jest/globals"
import { AIChatService } from "../../services/AIChatService/AIChatService.js"
import { AdaptiveChatThrottleManager } from "../../services/AIChatService/AdaptiveThrottleManager.js"
import { makeConfig, makeLogger } from "../test-utils/mocks.js"

class DummyProvider {
  async generateContent(): Promise<string> { return "ok" }
}

describe("aIChatService basic flows", () => {
  it("returns queued and emits response when AI enabled and key exists", async () => {
    const repo = {
      isAiEnabledForChat: async () => true,
      getApiKeyForChat: async () => ({ key: "k" }),
      getSystemPromptForChat: async () => "sys",
    }
    const logger = makeLogger()
    const config = makeConfig()
    const throttle = new AdaptiveChatThrottleManager(logger)
    jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any },
      new DummyProvider() as any,
      throttle,
    )
    await ai.initialize()

    const done = new Promise<void>((resolve) => {
      ;(ai as any).onMessageResponse = (_ctxId: string, response: string) => {
        expect(response).toBe("ok")
        resolve()
      }
    })

    const res = await ai.processMessage(1, 1, "hello")
    expect(res).toEqual({ success: true, queued: true, queuePosition: 1 })
    await done
  })

  it("returns not queued when AI disabled", async () => {
    const repo = {
      isAiEnabledForChat: async () => false,
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
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any },
      new DummyProvider() as any,
      new AdaptiveChatThrottleManager(logger),
    )
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
    class SlowProvider {
      async generateContent(): Promise<string> {
        await new Promise(r => setTimeout(r, 50))
        return "ok"
      }
    }
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any },
      new SlowProvider() as any,
      new AdaptiveChatThrottleManager(logger),
    )
    await ai.initialize()
    // Блокируем автопроцессор, чтобы очередь не опустошалась
    ;(ai as any).startQueueProcessor = jest.fn().mockResolvedValue(undefined)

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
    const throttle = new AdaptiveChatThrottleManager(logger)
    jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any },
      new DummyProvider() as any,
      throttle,
    )
    await ai.initialize()

    // Перехватим TypingManager
    const stopSpy = jest.spyOn((ai as any).typingManager, "stopTyping")
    const done = new Promise<void>((resolve) => {
      ;(ai as any).onMessageResponse = () => resolve()
    })
    await ai.processMessage(1, 1, "hello")
    await done
    // Даем циклу finally выполниться
    await new Promise<void>(resolve => setImmediate(resolve))
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
    const throttle = new AdaptiveChatThrottleManager(logger)
    jest.spyOn(throttle as any, "waitForThrottle").mockResolvedValue(undefined)
    const ai = new AIChatService(
      config,
      logger,
      { repository: repo as any },
      new FailingProvider() as any,
      throttle,
    )
    await ai.initialize()

    const done = new Promise<void>((resolve) => {
      ;(ai as any).onMessageResponse = (_ctxId: string, response: string, _mid: number, _umid?: number, isError?: boolean) => {
        expect(isError).toBe(true)
        expect(response).toMatch(/ошиб/i)
        resolve()
      }
    })
    await ai.processMessage(1, 1, "hello")
    await done
  })
})
