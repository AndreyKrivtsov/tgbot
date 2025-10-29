import { GroupManagementService } from "../../services/GroupManagementService/index.js"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"
import { EVENTS } from "../../core/EventBus.js"

describe("groupManagementService (unit)", () => {
  let service: GroupManagementService
  let mockChatRepository: any
  let mockAuthorizationService: any
  let mockTelegramPort: any
  let eventBus: any

  beforeEach(() => {
    eventBus = makeEventBus()
    mockChatRepository = {
      getChat: jest.fn().mockResolvedValue(null),
      registerChat: jest.fn().mockResolvedValue({ success: true }),
      unregisterChat: jest.fn().mockResolvedValue({ success: true }),
      addAdmin: jest.fn().mockResolvedValue(true),
    }
    mockAuthorizationService = {
      checkGroupAdmin: jest.fn().mockResolvedValue({ authorized: true }),
    }
    mockTelegramPort = {
      getChatAdministrators: jest.fn().mockResolvedValue([
        { user: { id: 1 } },
        { user: { id: 2 } },
      ]),
    }

    service = new GroupManagementService(makeConfig(), makeLogger(), {
      eventBus,
      chatRepository: mockChatRepository,
      authorizationService: mockAuthorizationService,
      telegramPort: mockTelegramPort,
    })
  })

  it("handleRegister: проверяет права админа", async () => {
    mockAuthorizationService.checkGroupAdmin.mockResolvedValueOnce({ authorized: false, reason: "no_group_admin_permission" })

    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_REGISTER, {
      actorId: 123,
      chatId: -456,
      messageId: 789,
      actorUsername: "user",
      chatTitle: "Test Group",
    })

    expect(mockAuthorizationService.checkGroupAdmin).toHaveBeenCalledWith(-456, 123, "user")
  })

  it("handleRegister: получает админов если чат не найден", async () => {
    mockChatRepository.getChat.mockResolvedValueOnce(null)

    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_REGISTER, {
      actorId: 123,
      chatId: -456,
      messageId: 789,
      actorUsername: "user",
      chatTitle: "Test Group",
    })

    expect(mockTelegramPort.getChatAdministrators).toHaveBeenCalledWith(-456)
    expect(mockChatRepository.addAdmin).toHaveBeenCalledTimes(2)
  })

  it("handleRegister: регистрирует чат при успешной проверке прав", async () => {
    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_REGISTER, {
      actorId: 123,
      chatId: -456,
      messageId: 789,
      actorUsername: "user",
      chatTitle: "Test Group",
    })

    expect(mockChatRepository.registerChat).toHaveBeenCalledWith(-456, "Test Group")
    expect(eventBus.emitAIResponse).toHaveBeenCalled()
  })

  it("handleUnregister: проверяет права и удаляет чат", async () => {
    await service.initialize()
    await eventBus.emit(EVENTS.COMMAND_UNREGISTER, {
      actorId: 123,
      chatId: -456,
      messageId: 789,
      actorUsername: "user",
    })

    expect(mockAuthorizationService.checkGroupAdmin).toHaveBeenCalledWith(-456, 123, "user")
    expect(mockChatRepository.unregisterChat).toHaveBeenCalledWith(-456)
    expect(eventBus.emitAIResponse).toHaveBeenCalled()
  })
})
