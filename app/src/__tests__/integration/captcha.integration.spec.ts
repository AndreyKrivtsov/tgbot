import { jest } from "@jest/globals"
import { CaptchaService } from "../../services/CaptchaService/index.js"
import { MemberHandler } from "../../services/TelegramBot/handlers/MemberHandler.js"
import { CallbackHandler } from "../../services/TelegramBot/handlers/CallbackHandler.js"
import { makeConfig, makeEventBus, makeLogger, makeUser } from "../test-utils/mocks.js"
import { EVENTS } from "../../core/EventBus.js"

describe("captcha integration (MemberHandler + CallbackHandler)", () => {
  it("полный поток: новый участник -> вопрос -> корректный ответ -> снятие ограничений", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => Date.now(),
      policy: { duplicateWindowMs: 2000 },
    })

    await service.initialize()

    const chatRepository = { isChatActive: async () => true } as any
    const settings = { deleteSystemMessages: false } as any

    const memberHandler = new MemberHandler(
      logger,
      settings,
      undefined,
      undefined,
      chatRepository,
      service,
      eventBus,
    )

    const callbackHandler = new CallbackHandler(logger, {} as any, service)

    // Перехватываем обработчик MEMBER_JOINED для CaptchaService
    const memberJoinedHandler = (eventBus as any).onMemberJoined.mock.calls.find((call: any[]) => call[0] !== undefined)?.[0]

    // Используем handleChatMember вместо handleNewChatMembers
    await memberHandler.handleChatMember({
      chat: { id: 1 },
      oldChatMember: {
        status: "left",
        isMember: () => false,
        user: makeUser(777, "user777", "John", false),
      },
      newChatMember: {
        status: "member",
        isMember: () => true,
        user: makeUser(777, "user777", "John", false),
      },
    } as any)

    // Проверяем, что было эмитировано событие MEMBER_JOINED
    expect((eventBus as any).emit).toHaveBeenCalledWith(EVENTS.MEMBER_JOINED, expect.objectContaining({
      userId: 777,
      chatId: 1,
    }))

    // Вызываем обработчик вручную, так как мок не делает это автоматически
    if (memberJoinedHandler) {
      await memberJoinedHandler({
        chatId: 1,
        userId: 777,
        username: "user777",
        firstName: "John",
      })
    }

    // Проверяем, что CaptchaService обработал событие и эмитировал captcha.challenge
    expect((eventBus as any).emit).toHaveBeenCalledWith("captcha.challenge", expect.objectContaining({
      userId: 777,
      chatId: 1,
    }))

    await callbackHandler.handleCallbackQuery({
      from: { id: 777 },
      data: "captcha_777_0_correct",
      answerCallbackQuery: jest.fn(),
    } as any)

    // Проверяем, что было эмитировано событие CAPTCHA_PASSED
    expect((eventBus as any).emitCaptchaPassed).toHaveBeenCalledWith(expect.objectContaining({
      userId: 777,
      chatId: 1,
    }))
    expect(service.isUserRestricted(777)).toBe(false)
  })

  it("memberHandler: неактивный чат — капча не запускается", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { eventBus })

    await service.initialize()

    const chatRepository = { isChatActive: async () => false } as any
    const settings = { deleteSystemMessages: false } as any

    const memberHandler = new MemberHandler(
      logger,
      settings,
      undefined,
      undefined,
      chatRepository,
      service,
      eventBus,
    )

    await memberHandler.handleChatMember({
      chat: { id: 2 },
      oldChatMember: {
        status: "left",
        isMember: () => false,
        user: makeUser(1, "u1", "U1", false),
      },
      newChatMember: {
        status: "member",
        isMember: () => true,
        user: makeUser(1, "u1", "U1", false),
      },
    } as any)

    // Неактивный чат — событие MEMBER_JOINED не эмитируется
    expect((eventBus as any).emit).not.toHaveBeenCalledWith(EVENTS.MEMBER_JOINED, expect.anything())
  })

  it("memberHandler: боты игнорируются", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { eventBus })

    await service.initialize()

    const chatRepository = { isChatActive: async () => true } as any
    const settings = { deleteSystemMessages: false } as any

    const memberHandler = new MemberHandler(
      logger,
      settings,
      undefined,
      undefined,
      chatRepository,
      service,
      eventBus,
    )

    await memberHandler.handleChatMember({
      chat: { id: 3 },
      oldChatMember: {
        status: "left",
        isMember: () => false,
        user: makeUser(2, "bot", "Bot", true),
      },
      newChatMember: {
        status: "member",
        isMember: () => true,
        user: makeUser(2, "bot", "Bot", true),
      },
    } as any)

    // Боты игнорируются — событие MEMBER_JOINED не эмитируется
    expect((eventBus as any).emit).not.toHaveBeenCalledWith(EVENTS.MEMBER_JOINED, expect.anything())
  })

  it("callbackHandler: чужая капча игнорируется", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { eventBus })

    await service.initialize()

    const callbackHandler = new CallbackHandler(logger, {} as any, service)

    await callbackHandler.handleCallbackQuery({
      from: { id: 999 },
      data: "captcha_777_0_correct", // не совпадает с from.id
      answerCallbackQuery: jest.fn(),
    } as any)

    // Проверяем, что не было эмитировано событие CAPTCHA_PASSED (чужая капча игнорируется)
    expect((eventBus as any).emitCaptchaPassed).not.toHaveBeenCalled()
  })
})
