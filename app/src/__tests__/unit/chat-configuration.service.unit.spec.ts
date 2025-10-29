import { ChatConfigurationService } from "../../services/ChatConfigurationService/index.js"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"
import { EVENTS } from "../../core/EventBus.js"

describe("ChatConfigurationService (unit)", () => {
  let service: ChatConfigurationService
  let mockChatRepository: any
  let mockAuthorizationService: any
  let mockTelegramPort: any
  let eventBus: any

  beforeEach(() => {
    eventBus = makeEventBus()
    mockChatRepository = {
      toggleAi: jest.fn().mockResolvedValue(true),
      setApiKey: jest.fn().mockResolvedValue(true),
      getChat: jest.fn().mockResolvedValue({ id: -123, active: true }),
      getActiveAiChats: jest.fn().mockResolvedValue([]),
      isAdmin: jest.fn().mockResolvedValue(false),
    }
    mockAuthorizationService = {
      checkGroupAdmin: jest.fn().mockResolvedValue({ authorized: true }),
      isSuperAdmin: jest.fn().mockReturnValue(false),
    }
    mockTelegramPort = {
      getChat: jest.fn().mockResolvedValue({
        id: -123,
        title: "Test Group",
        first_name: undefined,
      }),
    }

    service = new ChatConfigurationService(makeConfig(), makeLogger(), {
      eventBus,
      authorizationService: mockAuthorizationService,
      chatRepository: mockChatRepository,
      telegramPort: mockTelegramPort,
    })
  })

  it("handleUltronToggle: проверяет права для текущего чата", async () => {
    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_ULTRON_TOGGLE, {
      actorId: 123,
      chatId: -456,
      messageId: 789,
      enabled: true,
      actorUsername: "admin",
    })

    expect(mockAuthorizationService.checkGroupAdmin).toHaveBeenCalledWith(-456, 123, "admin")
    expect(mockChatRepository.toggleAi).toHaveBeenCalledWith(-456, true)
  })

  it("handleUltronToggle: требует суперадмина для другого чата", async () => {
    mockAuthorizationService.isSuperAdmin.mockReturnValueOnce(false)

    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_ULTRON_TOGGLE, {
      actorId: 123,
      chatId: -456,
      messageId: 789,
      targetChat: { username: "testgroup" },
      enabled: true,
      actorUsername: "user",
    })

    expect(mockAuthorizationService.isSuperAdmin).toHaveBeenCalledWith("user")
    expect(mockChatRepository.toggleAi).not.toHaveBeenCalled()
  })

  it("handleUltronToggle: включает AI для текущего чата", async () => {
    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_ULTRON_TOGGLE, {
      actorId: 123,
      chatId: -456,
      messageId: 789,
      enabled: true,
      actorUsername: "admin",
    })

    expect(mockChatRepository.toggleAi).toHaveBeenCalledWith(-456, true)
    expect(eventBus.emitAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: -456,
      }),
    )
  })

  it("handleAddAltronKey: работает только в приватном чате", async () => {
    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_ADD_ALTRON_KEY, {
      actorId: 123,
      chatId: -456, // группа
      messageId: 789,
      targetChat: { username: "testgroup" },
      apiKey: "test-key",
      actorUsername: "user",
    })

    expect(eventBus.emitAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: -456,
        text: expect.stringContaining("приватном чате"),
      }),
    )
  })

  it("handleAddAltronKey: проверяет права админа группы", async () => {
    mockChatRepository.isAdmin.mockResolvedValueOnce(true)

    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_ADD_ALTRON_KEY, {
      actorId: 123,
      chatId: 456, // приватный чат
      messageId: 789,
      targetChat: { username: "testgroup" },
      apiKey: "test-key",
      actorUsername: "user",
    })

    expect(mockChatRepository.isAdmin).toHaveBeenCalled()
  })

  it("handleAddAltronKey: сохраняет API ключ", async () => {
    mockChatRepository.getChat.mockResolvedValueOnce({ id: -123, active: true })
    mockChatRepository.isAdmin.mockResolvedValueOnce(true)

    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_ADD_ALTRON_KEY, {
      actorId: 123,
      chatId: 456,
      messageId: 789,
      targetChat: { username: "testgroup" },
      apiKey: "test-key-123",
      actorUsername: "user",
    })

    expect(mockChatRepository.setApiKey).toHaveBeenCalledWith(-123, "test-key-123")
    expect(eventBus.emitAIResponse).toHaveBeenCalled()
  })

  it("findChatByUsername: ищет через Telegram API", async () => {
    await service.findChatByUsername("testgroup")

    expect(mockTelegramPort.getChat).toHaveBeenCalledWith({
      chat_id: "@testgroup",
    })
  })
})

