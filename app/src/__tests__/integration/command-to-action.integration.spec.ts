import { jest } from "@jest/globals"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"
import { GroupManagementService } from "../../services/GroupManagementService/index.js"
import { ModerationService } from "../../services/ModerationService/index.js"
import { ChatConfigurationService } from "../../services/ChatConfigurationService/index.js"
import { TelegramActionsAdapter } from "../../services/TelegramBot/adapters/TelegramActionsAdapter.js"
import { EVENTS } from "../../core/EventBus.js"

describe("command-to-action flow (integration)", () => {
  let eventBus: any
  let groupManagementService: GroupManagementService
  let moderationService: ModerationService
  let chatConfigurationService: ChatConfigurationService
  let telegramActionsAdapter: any
  let mockBot: any
  let mockChatRepository: any
  let mockAuthorizationService: any

  beforeEach(() => {
    eventBus = makeEventBus()
    mockBot = {
      api: {
        sendMessage: jest.fn().mockResolvedValue({ message_id: 1 }),
        deleteMessage: jest.fn().mockResolvedValue(undefined),
        banChatMember: jest.fn().mockResolvedValue(undefined),
        unbanChatMember: jest.fn().mockResolvedValue(undefined),
        restrictChatMember: jest.fn().mockResolvedValue(undefined),
      },
    }
    mockChatRepository = {
      getChat: jest.fn().mockResolvedValue({ id: -123, active: true }),
      registerChat: jest.fn().mockResolvedValue({ success: true }),
      unregisterChat: jest.fn().mockResolvedValue({ success: true }),
      toggleAi: jest.fn().mockResolvedValue(true),
      setApiKey: jest.fn().mockResolvedValue(true),
      isAdmin: jest.fn().mockResolvedValue(true),
      addAdmin: jest.fn().mockResolvedValue(true),
      getActiveAiChats: jest.fn().mockResolvedValue([]),
    }
    mockAuthorizationService = {
      checkGroupAdmin: jest.fn().mockResolvedValue({ authorized: true }),
      isSuperAdmin: jest.fn().mockReturnValue(false),
    }

    const mockTelegramPort = {
      getChatAdministrators: jest.fn().mockResolvedValue([{ user: { id: 1 } }]) as any,
      getChatMember: jest.fn().mockResolvedValue({ user: { id: 999 } }) as any,
      getChat: jest.fn().mockResolvedValue({ id: -123, title: "Test" }) as any,
    }
    const mockUserManager = {
      getUserIdByUsername: jest.fn().mockResolvedValue(999),
      getUsernameByUserId: jest.fn().mockResolvedValue("user"),
    } as any

    groupManagementService = new GroupManagementService(makeConfig(), makeLogger(), {
      eventBus,
      chatRepository: mockChatRepository,
      authorizationService: mockAuthorizationService,
      telegramPort: mockTelegramPort,
    })

    moderationService = new ModerationService(makeConfig(), makeLogger(), {
      eventBus,
      authorizationService: mockAuthorizationService,
      userManager: mockUserManager,
      telegramPort: mockTelegramPort,
    })

    chatConfigurationService = new ChatConfigurationService(makeConfig(), makeLogger(), {
      eventBus,
      authorizationService: mockAuthorizationService,
      chatRepository: mockChatRepository,
      telegramPort: mockTelegramPort,
    })

    telegramActionsAdapter = new TelegramActionsAdapter(mockBot, makeLogger(), eventBus as any, mockUserManager)
  })

  it("register command → GroupManagementService → TelegramActionsAdapter", async () => {
    await groupManagementService.initialize()
    await telegramActionsAdapter.initialize()

    const handler = (eventBus as any).onCommandRegister.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        actorUsername: "admin",
        chatTitle: "Test Group",
      })
    }

    expect(mockChatRepository.registerChat).toHaveBeenCalledWith(-456, "Test Group")
    expect(eventBus.emitAIResponse).toHaveBeenCalled()
  })

  it("ban command → ModerationService → TelegramActionsAdapter", async () => {
    await moderationService.initialize()
    await telegramActionsAdapter.initialize()

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

    expect(eventBus.emitAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ type: "kick" }),
        ]),
      }),
    )
  })

  it("ultron toggle → ChatConfigurationService → TelegramActionsAdapter", async () => {
    await chatConfigurationService.initialize()
    await telegramActionsAdapter.initialize()

    const handler = (eventBus as any).onCommandUltronToggle.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        enabled: true,
        actorUsername: "admin",
      })
    }

    expect(mockChatRepository.toggleAi).toHaveBeenCalledWith(-456, true)
    expect(eventBus.emitAIResponse).toHaveBeenCalled()
  })

  it("full flow: command → service → actions → adapter", async () => {
    await groupManagementService.initialize()
    await telegramActionsAdapter.initialize()

    const handler = (eventBus as any).onCommandRegister.mock.calls[0]?.[0]
    if (handler) {
      await handler({
        actorId: 123,
        chatId: -456,
        messageId: 789,
        actorUsername: "admin",
        chatTitle: "Test Group",
      })
    }

    const aiResponseCall = (eventBus.emitAIResponse as jest.Mock).mock.calls[0]?.[0] as any
    expect(aiResponseCall?.actions).toContainEqual(
      expect.objectContaining({ type: "deleteMessage" }),
    )
    expect(aiResponseCall?.actions).toContainEqual(
      expect.objectContaining({ type: "sendMessage" }),
    )
  })
})
