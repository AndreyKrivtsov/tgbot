import { jest } from "@jest/globals"
import { AuthorizationService } from "../../services/AuthorizationService/index.js"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"

describe("AuthorizationService (unit)", () => {
  let service: AuthorizationService
  let mockChatRepository: any

  beforeEach(() => {
    mockChatRepository = {
      isAdmin: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    }
    service = new AuthorizationService(makeConfig(), makeLogger(), {
      eventBus: makeEventBus(),
      chatRepository: mockChatRepository,
    })
  })

  it("isSuperAdmin: возвращает true для админа", () => {
    const config = makeConfig()
    config.SUPER_ADMIN_USERNAME = "admin"
    const service = new AuthorizationService(config, makeLogger(), {
      eventBus: makeEventBus(),
      chatRepository: mockChatRepository,
    })

    expect(service.isSuperAdmin("admin")).toBe(true)
    expect(service.isSuperAdmin("not_admin")).toBe(false)
    expect(service.isSuperAdmin(undefined)).toBe(false)
  })

  it("isGroupAdmin: проверяет через ChatRepository", async () => {
    mockChatRepository.isAdmin.mockResolvedValueOnce(true)

    const result = await service.isGroupAdmin(123, 456)

    expect(result).toBe(true)
    expect(mockChatRepository.isAdmin).toHaveBeenCalledWith(123, 456)
  })

  it("checkGroupAdmin: возвращает authorized=true для суперадмина", async () => {
    const config = makeConfig()
    config.SUPER_ADMIN_USERNAME = "admin"
    const service = new AuthorizationService(config, makeLogger(), {
      eventBus: makeEventBus(),
      chatRepository: mockChatRepository,
    })

    const result = await service.checkGroupAdmin(123, 456, "admin")

    expect(result.authorized).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("checkGroupAdmin: возвращает authorized=true для админа группы", async () => {
    mockChatRepository.isAdmin.mockResolvedValueOnce(true)

    const result = await service.checkGroupAdmin(123, 456, "user")

    expect(result.authorized).toBe(true)
    expect(result.reason).toBeUndefined()
  })

  it("checkGroupAdmin: возвращает authorized=false без прав", async () => {
    mockChatRepository.isAdmin.mockResolvedValueOnce(false)

    const result = await service.checkGroupAdmin(123, 456, "user")

    expect(result.authorized).toBe(false)
    expect(result.reason).toBe("no_group_admin_permission")
  })
})

