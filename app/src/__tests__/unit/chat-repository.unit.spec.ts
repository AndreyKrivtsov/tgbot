import { jest } from "@jest/globals"
import { ChatRepository } from "../../repository/ChatRepository.js"
import { CACHE_CONFIG } from "../../constants.js"

describe("ChatRepository (unit)", () => {
  it("getChatAdmins: добавляет суперадмина из кеша", async () => {
    const chatId = -123
    const cachedAdmins = [
      {
        groupId: chatId,
        userId: 111,
        username: "admin1",
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
      },
    ]
    const superAdmin = { userId: 999, username: "superadmin" }

    const mockDatabaseService = {
      getDb: jest.fn(),
    } as any

    const mockRedisService = {
      get: jest.fn(async (key: string) => {
        if (key === `${CACHE_CONFIG.KEYS.CHAT_ADMINS}:${chatId}`) {
          return cachedAdmins
        }
        return null
      }),
      getSuperAdmin: jest.fn(async () => superAdmin),
    } as any

    const repository = new ChatRepository(mockDatabaseService, undefined, mockRedisService)

    const result = await repository.getChatAdmins(chatId)

    expect(mockRedisService.get).toHaveBeenCalledWith(`${CACHE_CONFIG.KEYS.CHAT_ADMINS}:${chatId}`)
    expect(mockRedisService.getSuperAdmin).toHaveBeenCalled()
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual(cachedAdmins[0])
    expect(result[1]).toEqual(expect.objectContaining({
      groupId: chatId,
      userId: superAdmin.userId,
      username: superAdmin.username,
    }))
  })
})
