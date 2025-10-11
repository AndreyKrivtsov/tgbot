import { jest } from "@jest/globals"
import { CaptchaService } from "../../services/CaptchaService/index.js"
import { MemberHandler } from "../../services/TelegramBot/handlers/MemberHandler.js"
import { CallbackHandler } from "../../services/TelegramBot/handlers/CallbackHandler.js"
import { makeActions, makeConfig, makeLogger, makeUser } from "../test-utils/mocks.js"

describe("captcha integration (MemberHandler + CallbackHandler)", () => {
  it("полный поток: новый участник -> вопрос -> корректный ответ -> снятие ограничений", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, {
      actions,
      now: () => Date.now(),
      policy: { duplicateWindowMs: 2000 },
    })

    const chatRepository = { isChatActive: async () => true } as any
    const userManager = {
      saveUserMapping: jest.fn<(
        chatId: number,
        userId: number,
        username?: string,
      ) => Promise<void>>().mockResolvedValue(undefined),
      hasMessageCounter: jest.fn<(userId: number) => Promise<boolean>>().mockResolvedValue(false),
      deleteMessageCounter: jest.fn<(userId: number) => Promise<void>>().mockResolvedValue(undefined),
    } as any

    const settings = { deleteSystemMessages: false } as any

    const memberHandler = new MemberHandler(
      logger,
      settings,
      undefined,
      undefined,
      userManager,
      chatRepository,
      service,
    )

    const callbackHandler = new CallbackHandler(logger, {} as any, service)

    await memberHandler.handleNewChatMembers({
      chat: { id: 1 },
      newChatMembers: [makeUser(777, "user777", "John", false)],
      id: 999,
    } as any)

    expect((actions as any).sendCaptchaMessage).toHaveBeenCalled()
    expect((actions as any).restrictUser).toHaveBeenCalledWith(1, 777)

    await callbackHandler.handleCallbackQuery({
      from: { id: 777 },
      data: "captcha_777_0_correct",
      answerCallbackQuery: jest.fn(),
    } as any)

    expect((actions as any).unrestrictUser).toHaveBeenCalledWith(1, 777)
    expect(service.isUserRestricted(777)).toBe(false)
  })

  it("memberHandler: неактивный чат — капча не запускается", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { actions })

    const chatRepository = { isChatActive: async () => false } as any
    const userManager = {
      saveUserMapping: jest.fn<(
        chatId: number,
        userId: number,
        username?: string,
      ) => Promise<void>>().mockResolvedValue(undefined),
      hasMessageCounter: jest.fn<(userId: number) => Promise<boolean>>().mockResolvedValue(false),
      deleteMessageCounter: jest.fn<(userId: number) => Promise<void>>().mockResolvedValue(undefined),
    } as any

    const settings = { deleteSystemMessages: false } as any

    const memberHandler = new MemberHandler(
      logger,
      settings,
      undefined,
      undefined,
      userManager,
      chatRepository,
      service,
    )

    await memberHandler.handleNewChatMembers({
      chat: { id: 2 },
      newChatMembers: [makeUser(1, "u1", "U1", false)],
      id: 100,
    } as any)

    expect((actions as any).sendCaptchaMessage).not.toHaveBeenCalled()
    expect((actions as any).restrictUser).not.toHaveBeenCalled()
  })

  it("memberHandler: боты игнорируются", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { actions })

    const chatRepository = { isChatActive: async () => true } as any
    const userManager = {
      saveUserMapping: jest.fn<(
        chatId: number,
        userId: number,
        username?: string,
      ) => Promise<void>>().mockResolvedValue(undefined),
      hasMessageCounter: jest.fn<(userId: number) => Promise<boolean>>().mockResolvedValue(false),
      deleteMessageCounter: jest.fn<(userId: number) => Promise<void>>().mockResolvedValue(undefined),
    } as any

    const settings = { deleteSystemMessages: false } as any

    const memberHandler = new MemberHandler(
      logger,
      settings,
      undefined,
      undefined,
      userManager,
      chatRepository,
      service,
    )

    await memberHandler.handleNewChatMembers({
      chat: { id: 3 },
      newChatMembers: [makeUser(2, "bot", "Bot", true)],
      id: 101,
    } as any)

    expect((actions as any).sendCaptchaMessage).not.toHaveBeenCalled()
    expect((actions as any).restrictUser).not.toHaveBeenCalled()
  })

  it("callbackHandler: чужая капча игнорируется", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { actions })

    const callbackHandler = new CallbackHandler(logger, {} as any, service)

    await callbackHandler.handleCallbackQuery({
      from: { id: 999 },
      data: "captcha_777_0_correct", // не совпадает с from.id
      answerCallbackQuery: jest.fn(),
    } as any)

    expect((actions as any).unrestrictUser).not.toHaveBeenCalled()
    expect((actions as any).deleteMessage).not.toHaveBeenCalled()
  })
})
