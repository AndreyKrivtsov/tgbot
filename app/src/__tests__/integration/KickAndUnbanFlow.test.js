// Интеграционный тест для проверки кика и автоматического разбана пользователя
// Проверяет что после кика пользователя через 5 секунд происходит разбан

describe("Kick and Auto-Unban Integration Flow", () => {
  // Мок TelegramBot API
  class MockTelegramBot {
    constructor() {
      this.bannedUsers = new Set()
      this.apiCalls = []
    }

    // Имитация API
    get api() {
      return {
        banChatMember: async ({ chat_id, user_id }) => {
          this.bannedUsers.add(`${chat_id}_${user_id}`)
          this.apiCalls.push({ method: 'banChatMember', chat_id, user_id, timestamp: Date.now() })
          return { ok: true }
        },
        unbanChatMember: async ({ chat_id, user_id }) => {
          this.bannedUsers.delete(`${chat_id}_${user_id}`)
          this.apiCalls.push({ method: 'unbanChatMember', chat_id, user_id, timestamp: Date.now() })
          return { ok: true }
        }
      }
    }

    isUserBanned(chatId, userId) {
      return this.bannedUsers.has(`${chatId}_${userId}`)
    }

    getApiCalls() {
      return this.apiCalls
    }
  }

  // Мок Logger
  class MockLogger {
    constructor() {
      this.logs = []
    }

    i(message) {
      this.logs.push({ level: 'info', message, timestamp: Date.now() })
    }

    e(message, error) {
      this.logs.push({ level: 'error', message, error, timestamp: Date.now() })
    }

    getLogs() {
      return this.logs
    }
  }

  // Упрощенная версия метода kickUserFromChat для тестирования
  async function kickUserFromChat(bot, logger, chatId, userId, userName) {
    try {
      await bot.api.banChatMember({
        chat_id: chatId,
        user_id: userId,
      })
      logger.i(`User ${userName} (${userId}) kicked from chat ${chatId}`)

      // Автоматический разбан через 5 секунд
      setTimeout(async () => {
        await unbanUserFromChat(bot, logger, chatId, userId, userName)
      }, 5000)
    } catch (error) {
      logger.e(`Error kicking user ${userName} from chat:`, error)
    }
  }

  async function unbanUserFromChat(bot, logger, chatId, userId, userName) {
    try {
      await bot.api.unbanChatMember({
        chat_id: chatId,
        user_id: userId,
      })
      logger.i(`User ${userName} (${userId}) unbanned from chat ${chatId}`)
    } catch (error) {
      logger.e(`Error unbanning user ${userName} from chat:`, error)
    }
  }

  it("должен банить пользователя и затем разбанить через 5 секунд", async () => {
    const bot = new MockTelegramBot()
    const logger = new MockLogger()
    const chatId = -1001234567890
    const userId = 123456789
    const userName = "TestUser"

    // Кикаем пользователя
    await kickUserFromChat(bot, logger, chatId, userId, userName)

    // Проверяем что пользователь забанен
    expect(bot.isUserBanned(chatId, userId)).toBe(true)
    
    // Проверяем что вызвался banChatMember
    const apiCalls = bot.getApiCalls()
    expect(apiCalls).toHaveLength(1)
    expect(apiCalls[0].method).toBe('banChatMember')
    expect(apiCalls[0].chat_id).toBe(chatId)
    expect(apiCalls[0].user_id).toBe(userId)

    // Ждем 5.1 секунды для автоматического разбана
    await new Promise(resolve => setTimeout(resolve, 5100))

    // Проверяем что пользователь разбанен
    expect(bot.isUserBanned(chatId, userId)).toBe(false)
    
    // Проверяем что вызвался unbanChatMember
    const updatedApiCalls = bot.getApiCalls()
    expect(updatedApiCalls).toHaveLength(2)
    expect(updatedApiCalls[1].method).toBe('unbanChatMember')
    expect(updatedApiCalls[1].chat_id).toBe(chatId)
    expect(updatedApiCalls[1].user_id).toBe(userId)

    // Проверяем логи
    const logs = logger.getLogs()
    expect(logs).toHaveLength(2)
    expect(logs[0].message).toContain('kicked from chat')
    expect(logs[1].message).toContain('unbanned from chat')
  }, 10000) // Увеличиваем таймаут теста до 10 секунд

  it("должен корректно обрабатывать ошибки при бане", async () => {
    const bot = {
      api: {
        banChatMember: async () => {
          throw new Error("API Error")
        }
      }
    }
    const logger = new MockLogger()

    await kickUserFromChat(bot, logger, -1001234567890, 123456789, "TestUser")

    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].level).toBe('error')
    expect(logs[0].message).toContain('Error kicking user')
  })
}) 