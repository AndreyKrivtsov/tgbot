import type { Logger } from "../../helpers/Logger.js"

/**
 * Интерфейс для результата проверки упоминания бота
 */
export interface BotMentionResult {
  isMention: boolean
  cleanedMessage: string
}

/**
 * Интерфейс для контекстуального сообщения
 */
export interface ContextualMessage {
  content: string
  hasUserInfo: boolean
}

/**
 * Интерфейс для MessageProcessor
 */
export interface IMessageProcessor {
  isBotMention: (message: string, botUsername?: string, replyToBotMessage?: boolean) => boolean
  cleanBotMention: (message: string, botUsername?: string) => string
  processBotMention: (message: string, botUsername?: string, replyToBotMessage?: boolean) => BotMentionResult
  prepareContextualMessage: (message: string, username?: string, firstName?: string) => ContextualMessage
  validateMessage: (message: string) => { isValid: boolean, reason?: string }
}

/**
 * Сервис для обработки сообщений
 */
export class MessageProcessor implements IMessageProcessor {
  private logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  /**
   * Проверка, является ли сообщение обращением к боту
   */
  isBotMention(message: string, botUsername?: string, replyToBotMessage?: boolean): boolean {
    if (!message || message.trim().length === 0) {
      return false
    }

    // Если это ответ на сообщение бота, то это обращение к боту
    if (replyToBotMessage) {
      return true
    }

    const text = message.toLowerCase().trim()

    // Прямое упоминание через @username
    if (botUsername && text.includes(`@${botUsername.toLowerCase()}`)) {
      return true
    }

    // Обращение "эй бот", "альтрон" и т.д.
    const botTriggers = [
      /^эй.{0,3}бот\W?/i,
      /^альтрон/gi,
      /^бот[,\s]/i,
    ]

    for (const trigger of botTriggers) {
      if (trigger.test(text)) {
        return true
      }
    }

    return false
  }

  /**
   * Очистка сообщения от упоминаний бота
   */
  cleanBotMention(message: string, botUsername?: string): string {
    let cleaned = message.trim()

    // Убираем @username
    if (botUsername) {
      cleaned = cleaned.replace(new RegExp(`@${botUsername}`, "gi"), "").trim()
    }

    // Убираем стандартные обращения
    cleaned = cleaned.replace(/^эй.{0,3}бот\W?/i, "").trim()
    cleaned = cleaned.replace(/^альтрон\W?/gi, "").trim()
    cleaned = cleaned.replace(/^бот[,\s]/i, "").trim()

    return cleaned || message
  }

  /**
   * Комплексная обработка упоминания бота
   */
  processBotMention(message: string, botUsername?: string, replyToBotMessage?: boolean): BotMentionResult {
    const isMention = this.isBotMention(message, botUsername, replyToBotMessage)
    const cleanedMessage = isMention ? this.cleanBotMention(message, botUsername) : message

    return {
      isMention,
      cleanedMessage,
    }
  }

  /**
   * Подготовка контекстного сообщения с информацией о пользователе
   */
  prepareContextualMessage(message: string, username?: string, firstName?: string): ContextualMessage {
    let contextualMessage = message

    // Добавляем информацию о пользователе если она есть
    if (username || firstName) {
      const userInfo = []
      if (firstName)
        userInfo.push(`имя: ${firstName}`)
      if (username)
        userInfo.push(`@${username}`)

      if (userInfo.length > 0) {
        contextualMessage = `[${userInfo.join(", ")}]: ${message}`
      }
    }

    return {
      content: contextualMessage,
      hasUserInfo: !!(username || firstName),
    }
  }

  /**
   * Валидация сообщения
   */
  validateMessage(message: string): { isValid: boolean, reason?: string } {
    // Проверка на пустое сообщение
    if (!message || message.trim().length === 0) {
      return { isValid: false, reason: "Сообщение пустое" }
    }

    // Проверка на слишком длинное сообщение
    if (message.length > 4000) {
      return { isValid: false, reason: "Сообщение слишком длинное" }
    }

    // Проверка на спам (много повторяющихся символов)
    if (this.isSpamMessage(message)) {
      return { isValid: false, reason: "Сообщение похоже на спам" }
    }

    return { isValid: true }
  }

  /**
   * Проверка на спам
   */
  private isSpamMessage(message: string): boolean {
    // Простая эвристика: если более 70% символов одинаковые
    const chars = message.split("")
    const charCount = new Map<string, number>()

    chars.forEach((char) => {
      if (char !== " ") {
        charCount.set(char, (charCount.get(char) || 0) + 1)
      }
    })

    const maxCount = Math.max(...charCount.values())
    const totalNonSpaceChars = chars.filter(c => c !== " ").length

    return totalNonSpaceChars > 10 && maxCount / totalNonSpaceChars > 0.7
  }

  /**
   * Извлечение команд из сообщения
   */
  extractCommands(message: string): string[] {
    const commands = message.match(/\/\w+/g) || []
    return commands.map(cmd => cmd.toLowerCase())
  }

  /**
   * Проверка на наличие упоминаний пользователей
   */
  hasUserMentions(message: string): boolean {
    return /@\w+/.test(message)
  }

  /**
   * Получение статистики сообщения
   */
  getMessageStats(message: string): {
    length: number
    wordCount: number
    hasEmojis: boolean
    hasLinks: boolean
  } {
    const words = message.split(/\s+/).filter(word => word.length > 0)
    const hasEmojis = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u.test(message)
    const hasLinks = /https?:\/\/\S+/.test(message)

    return {
      length: message.length,
      wordCount: words.length,
      hasEmojis,
      hasLinks,
    }
  }
}
