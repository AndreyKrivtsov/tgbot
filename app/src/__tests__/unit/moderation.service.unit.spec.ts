import { jest } from "@jest/globals"
import { ModerationService } from "../../services/ModerationService/index.js"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"
import { EVENTS } from "../../core/EventBus.js"

describe("moderationService (unit)", () => {
  let service: ModerationService
  let mockChatRepository: any
  let mockAuthorizationService: any
  let mockTelegramPort: any
  let mockUserManager: any
  let eventBus: any

  beforeEach(() => {
    eventBus = makeEventBus()
    mockChatRepository = {
      isAdmin: jest.fn().mockResolvedValue(false),
    } as any
    mockAuthorizationService = {
      checkGroupAdmin: jest.fn().mockResolvedValue({ authorized: true }),
      isSuperAdmin: jest.fn().mockReturnValue(false),
    } as any
    mockTelegramPort = {
      getChatMember: jest.fn().mockResolvedValue({
        user: { id: 123, username: "target" },
      }),
    } as any
    mockUserManager = {
      getUserIdByUsername: jest.fn().mockResolvedValue(null),
      getUsernameByUserId: jest.fn().mockResolvedValue(null),
    } as any

    service = new ModerationService(makeConfig(), makeLogger(), {
      eventBus,
      authorizationService: mockAuthorizationService,
      userManager: mockUserManager,
      telegramPort: mockTelegramPort,
    })
  })

  it("handleBan: проверяет права админа", async () => {
    mockAuthorizationService.checkGroupAdmin.mockResolvedValueOnce({ authorized: false, reason: "no_group_admin_permission" })

    await service.initialize()
    const handler = (eventBus as any).onCommandBan.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        target: { userId: 999 },
        actorUsername: "admin",
      })
    }

    expect(mockAuthorizationService.checkGroupAdmin).toHaveBeenCalledWith(-456, 123, "admin")
  })

  it("handleBan: выполняет kick при успешной проверке", async () => {
    await service.initialize()
    const handler = (eventBus as any).onCommandBan.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        target: { userId: 999, username: "target" },
        actorUsername: "admin",
      })
    }

    expect(eventBus.emitAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: -456,
        actions: expect.arrayContaining([
          expect.objectContaining({ type: "deleteMessage" }),
          expect.objectContaining({ type: "kick" }),
          expect.objectContaining({ type: "sendMessage" }),
        ]),
      }),
    )
  })

  it("handleUnban: выполняет unban", async () => {
    await service.initialize()
    const handler = (eventBus as any).onCommandUnban.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        target: { userId: 999 },
        actorUsername: "admin",
      })
    }

    expect(eventBus.emitAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ type: "deleteMessage" }),
          expect.objectContaining({ type: "unban" }),
        ]),
      }),
    )
  })

  it("handleMute: проверяет что пользователь в чате перед мьютом", async () => {
    mockTelegramPort.getChatMember.mockResolvedValueOnce({
      user: { id: 999 },
    })

    await service.initialize()
    const handler = (eventBus as any).onCommandMute.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        target: { userId: 999 },
        actorUsername: "admin",
      })
    }

    expect(mockTelegramPort.getChatMember).toHaveBeenCalledWith({
      chat_id: -456,
      user_id: 999,
    })
    expect(eventBus.emitAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ type: "restrict" }),
        ]),
      }),
    )
  })

  it("handleUnmute: выполняет unrestrict", async () => {
    mockTelegramPort.getChatMember.mockResolvedValueOnce({
      user: { id: 999 },
    })

    await service.initialize()
    const handler = (eventBus as any).onCommandUnmute.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        target: { userId: 999 },
        actorUsername: "admin",
      })
    }

    expect(eventBus.emitAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ type: "unrestrict" }),
        ]),
      }),
    )
  })

  it("resolveTarget: ищет userId по username через UserManager", async () => {
    mockUserManager.getUserIdByUsername.mockResolvedValueOnce(999)

    await service.initialize()
    const handler = (eventBus as any).onCommandBan.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        target: { username: "target" },
        actorUsername: "admin",
      })
    }

    expect(mockUserManager.getUserIdByUsername).toHaveBeenCalledWith(-456, "target")
  })
})
