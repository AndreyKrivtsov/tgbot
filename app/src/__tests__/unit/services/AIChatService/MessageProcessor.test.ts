import { MessageProcessor } from "../../../../services/AIChatService/MessageProcessor.js"
import type { Logger } from "../../../../helpers/Logger.js"

// Мокаем Logger
const mockLogger = {
  i: jest.fn(),
  d: jest.fn(),
  w: jest.fn(),
  e: jest.fn(),
} as unknown as Logger

describe("messageProcessor", () => {
  let messageProcessor: MessageProcessor

  beforeEach(() => {
    messageProcessor = new MessageProcessor(mockLogger)
  })

  describe("isBotMention", () => {
    it("should return true for direct bot mention", () => {
      const result = messageProcessor.isBotMention("@testbot привет", "testbot")
      expect(result).toBe(true)
    })

    it("should return true for reply to bot message", () => {
      const result = messageProcessor.isBotMention("привет", undefined, true)
      expect(result).toBe(true)
    })

    it("should return true for 'альтрон' trigger", () => {
      const result = messageProcessor.isBotMention("альтрон, как дела?")
      expect(result).toBe(true)
    })

    it("should return true for 'эй бот' trigger", () => {
      const result = messageProcessor.isBotMention("эй бот, помоги")
      expect(result).toBe(true)
    })

    it("should return false for regular message", () => {
      const result = messageProcessor.isBotMention("обычное сообщение")
      expect(result).toBe(false)
    })

    it("should return false for empty message", () => {
      const result = messageProcessor.isBotMention("")
      expect(result).toBe(false)
    })
  })

  describe("cleanBotMention", () => {
    it("should remove bot username from message", () => {
      const result = messageProcessor.cleanBotMention("@testbot привет", "testbot")
      expect(result).toBe("привет")
    })

    it("should remove 'альтрон' from message", () => {
      const result = messageProcessor.cleanBotMention("альтрон, как дела?")
      expect(result).toBe("как дела?")
    })

    it("should remove 'эй бот' from message", () => {
      const result = messageProcessor.cleanBotMention("эй бот, помоги")
      expect(result).toBe("помоги")
    })

    it("should return original message if no bot mention", () => {
      const result = messageProcessor.cleanBotMention("обычное сообщение")
      expect(result).toBe("обычное сообщение")
    })
  })

  describe("processBotMention", () => {
    it("should process bot mention correctly", () => {
      const result = messageProcessor.processBotMention("@testbot привет", "testbot")
      expect(result).toEqual({
        isMention: true,
        cleanedMessage: "привет",
      })
    })

    it("should process non-mention correctly", () => {
      const result = messageProcessor.processBotMention("обычное сообщение")
      expect(result).toEqual({
        isMention: false,
        cleanedMessage: "обычное сообщение",
      })
    })
  })

  describe("prepareContextualMessage", () => {
    it("should add user info to message", () => {
      const result = messageProcessor.prepareContextualMessage(
        "тест",
        "username",
        "Иван",
      )
      expect(result).toEqual({
        content: "[имя: Иван, @username]: тест",
        hasUserInfo: true,
      })
    })

    it("should work with only username", () => {
      const result = messageProcessor.prepareContextualMessage("тест", "username")
      expect(result).toEqual({
        content: "[@username]: тест",
        hasUserInfo: true,
      })
    })

    it("should work with only first name", () => {
      const result = messageProcessor.prepareContextualMessage("тест", undefined, "Иван")
      expect(result).toEqual({
        content: "[имя: Иван]: тест",
        hasUserInfo: true,
      })
    })

    it("should work without user info", () => {
      const result = messageProcessor.prepareContextualMessage("тест")
      expect(result).toEqual({
        content: "тест",
        hasUserInfo: false,
      })
    })
  })

  describe("validateMessage", () => {
    it("should validate normal message", () => {
      const result = messageProcessor.validateMessage("нормальное сообщение")
      expect(result).toEqual({
        isValid: true,
      })
    })

    it("should reject empty message", () => {
      const result = messageProcessor.validateMessage("")
      expect(result).toEqual({
        isValid: false,
        reason: "Сообщение пустое",
      })
    })

    it("should reject too long message", () => {
      const longMessage = "а".repeat(5000)
      const result = messageProcessor.validateMessage(longMessage)
      expect(result).toEqual({
        isValid: false,
        reason: "Сообщение слишком длинное",
      })
    })

    it("should reject spam message", () => {
      const spamMessage = "аааааааааааааааааааааааааааааааа"
      const result = messageProcessor.validateMessage(spamMessage)
      expect(result).toEqual({
        isValid: false,
        reason: "Сообщение похоже на спам",
      })
    })
  })

  describe("getMessageStats", () => {
    it("should return correct stats", () => {
      const result = messageProcessor.getMessageStats("Привет мир! https://example.com 😊")
      expect(result).toEqual({
        length: 34,
        wordCount: 3,
        hasEmojis: true,
        hasLinks: true,
      })
    })

    it("should detect no emojis or links", () => {
      const result = messageProcessor.getMessageStats("простое сообщение")
      expect(result).toEqual({
        length: 17,
        wordCount: 2,
        hasEmojis: false,
        hasLinks: false,
      })
    })
  })

  describe("extractCommands", () => {
    it("should extract commands from message", () => {
      const result = messageProcessor.extractCommands("Используйте /start и /help")
      expect(result).toEqual(["/start", "/help"])
    })

    it("should return empty array if no commands", () => {
      const result = messageProcessor.extractCommands("обычное сообщение")
      expect(result).toEqual([])
    })
  })

  describe("hasUserMentions", () => {
    it("should detect user mentions", () => {
      const result = messageProcessor.hasUserMentions("Привет @username")
      expect(result).toBe(true)
    })

    it("should return false if no mentions", () => {
      const result = messageProcessor.hasUserMentions("обычное сообщение")
      expect(result).toBe(false)
    })
  })
})
