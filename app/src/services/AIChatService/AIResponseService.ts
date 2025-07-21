import type { Logger } from "../../helpers/Logger.js"
import type { IAIProvider } from "./providers/IAIProvider.js"
import type { ChatContext } from "./ChatContextManager.js"
import { AI_CHAT_CONFIG } from "../../constants.js"

/**
 * Интерфейс для результата генерации ответа
 */
export interface AIResponseResult {
  success: boolean
  response?: string
  error?: string
  tokenUsage?: number
  processingTime?: number
  functionCall?: {
    name: string
    args: any
  }
}

/**
 * Интерфейс для параметров генерации ответа
 */
export interface AIResponseParams {
  message: string
  context: ChatContext
  systemPrompt: string
  apiKey: string
  maxRetries?: number
  tools?: any[]
}

/**
 * Интерфейс для статистики ответа
 */
export interface ResponseStats {
  length: number
  wordCount: number
  processingTime: number
  isError: boolean
}

/**
 * Интерфейс для AIResponseService
 */
export interface IAIResponseService {
  generateResponse: (params: AIResponseParams) => Promise<AIResponseResult>
  formatResponse: (response: string) => string
  getResponseStats: (response: string, processingTime: number, isError: boolean) => ResponseStats
  validateResponse: (response: string) => { isValid: boolean, reason?: string }
}

/**
 * Сервис для генерации AI ответов
 */
export class AIResponseService implements IAIResponseService {
  private logger: Logger
  private aiProvider: IAIProvider

  constructor(logger: Logger, aiProvider: IAIProvider) {
    this.logger = logger
    this.aiProvider = aiProvider
  }

  /**
   * Генерация ответа с использованием AI провайдера
   */
  async generateResponse(params: AIResponseParams): Promise<AIResponseResult> {
    const { message, context, systemPrompt, apiKey, maxRetries: _maxRetries = 3, tools } = params
    const startTime = Date.now()

    this.logger.d(`Generating AI response for context ${context.chatId}`)

    try {
      // Подготавливаем сообщения для AI
      const messages = this.prepareMessages(context, message, systemPrompt)

      // Генерируем ответ с инструментами
      const response = await this.aiProvider.generateContent(apiKey, message, messages, systemPrompt, {}, tools)

      const processingTime = Date.now() - startTime

      // Проверяем на вызов функции
      if (this.isFunctionCall(response)) {
        const functionCall = this.parseFunctionCall(response)
        this.logger.d(`Function call detected: ${functionCall.name}`)

        return {
          success: true,
          functionCall,
          processingTime,
        }
      }

      // Валидируем ответ
      const validation = this.validateResponse(response)
      if (!validation.isValid) {
        this.logger.w(`Invalid AI response: ${validation.reason}`)
        return {
          success: false,
          error: validation.reason,
          processingTime,
        }
      }

      // Форматируем ответ
      const formattedResponse = this.formatResponse(response)

      this.logger.d(`AI response generated successfully in ${processingTime}ms`)

      return {
        success: true,
        response: formattedResponse,
        processingTime,
      }
    } catch (error) {
      const processingTime = Date.now() - startTime

      // Логируем читаемую ошибку
      const errorMessage = this.formatError(error)
      this.logger.e(`AI response generation failed: ${errorMessage}`)

      return {
        success: false,
        error: errorMessage,
        processingTime,
      }
    }
  }

  /**
   * Подготовка сообщений для AI провайдера
   */
  private prepareMessages(context: ChatContext, newMessage: string, systemPrompt: string): any[] {
    const messages: any[] = []

    // Добавляем системный промпт
    messages.push({
      role: "system",
      content: systemPrompt,
    })

    // Добавляем контекст предыдущих сообщений
    context.messages.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      })
    })

    // Добавляем новое сообщение
    messages.push({
      role: "user",
      content: newMessage,
    })

    return messages
  }

  /**
   * Форматирование ответа
   */
  formatResponse(response: string): string {
    let formatted = response.trim()

    // Убираем лишние пробелы и переносы
    formatted = formatted.replace(/\n\s*\n/g, "\n\n")
    formatted = formatted.replace(/\s+/g, " ")

    // Обрезаем слишком длинные ответы
    if (formatted.length > AI_CHAT_CONFIG.MAX_RESPONSE_LENGTH) {
      formatted = `${formatted.substring(0, AI_CHAT_CONFIG.MAX_RESPONSE_LENGTH - 3)}...`
      this.logger.w("Response truncated due to length limit")
    }

    return formatted
  }

  /**
   * Валидация ответа
   */
  validateResponse(response: string): { isValid: boolean, reason?: string } {
    if (!response || response.trim().length === 0) {
      return { isValid: false, reason: "Пустой ответ" }
    }

    if (response.length > AI_CHAT_CONFIG.MAX_RESPONSE_LENGTH * 2) {
      return { isValid: false, reason: "Ответ слишком длинный" }
    }

    // Проверка на спам или мусор
    if (this.isSpamResponse(response)) {
      return { isValid: false, reason: "Ответ похож на спам" }
    }

    return { isValid: true }
  }

  /**
   * Проверка на спам в ответе
   */
  private isSpamResponse(response: string): boolean {
    // Простая эвристика: если много повторяющихся символов или слов
    const words = response.split(/\s+/)
    const wordCount = new Map<string, number>()

    words.forEach((word) => {
      if (word.length > 2) {
        wordCount.set(word.toLowerCase(), (wordCount.get(word.toLowerCase()) || 0) + 1)
      }
    })

    // Если какое-то слово повторяется более 30% от общего количества
    const maxCount = Math.max(...wordCount.values())
    return words.length > 10 && maxCount / words.length > 0.3
  }

  /**
   * Проверка на вызов функции
   */
  private isFunctionCall(response: string): boolean {
    try {
      const parsed = JSON.parse(response)
      return parsed.type === "function_call" && parsed.function_call && parsed.function_call.name
    } catch {
      return false
    }
  }

  /**
   * Парсинг вызова функции
   */
  private parseFunctionCall(response: string): { name: string, args: any } {
    try {
      const parsed = JSON.parse(response)
      return {
        name: parsed.function_call.name,
        args: parsed.function_call.args || {},
      }
    } catch (error) {
      throw new Error(`Invalid function call format: ${error}`)
    }
  }

  /**
   * Получение статистики ответа
   */
  getResponseStats(response: string, processingTime: number, isError: boolean): ResponseStats {
    const words = response.split(/\s+/).filter(word => word.length > 0)

    return {
      length: response.length,
      wordCount: words.length,
      processingTime,
      isError,
    }
  }

  /**
   * Создание сообщения об ошибке для пользователя
   */
  createErrorMessage(_error: string): string {
    // Возвращаем простое сообщение об ошибке
    const errorMessages = [
      "Произошла ошибка при генерации ответа",
      "Не удалось получить ответ от AI",
      "Сервис временно недоступен",
    ]

    // Выбираем случайное сообщение об ошибке
    const randomMessage = errorMessages[Math.floor(Math.random() * errorMessages.length)]

    this.logger.d(`Using error message: ${randomMessage}`)

    return randomMessage!
  }

  /**
   * Проверка качества ответа
   */
  assessResponseQuality(response: string): {
    score: number
    factors: string[]
  } {
    const factors: string[] = []
    let score = 100

    // Проверка длины
    if (response.length < 10) {
      score -= 30
      factors.push("Слишком короткий")
    } else if (response.length > 2000) {
      score -= 20
      factors.push("Слишком длинный")
    }

    // Проверка на читаемость
    const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0)
    if (sentences.length < 1) {
      score -= 40
      factors.push("Нет предложений")
    }

    // Проверка на повторы
    if (this.isSpamResponse(response)) {
      score -= 50
      factors.push("Много повторов")
    }

    return {
      score: Math.max(0, score),
      factors,
    }
  }

  /**
   * Форматирование ошибки для читаемого лога
   */
  private formatError(error: any): string {
    if (error?.response?.status) {
      // HTTP ошибка
      const status = error.response.status
      const statusText = error.response.statusText || "Unknown Error"

      // Пытаемся извлечь детали ошибки из ответа
      let details = ""
      if (error.response.data?.error?.message) {
        details = ` - ${error.response.data.error.message}`
      } else if (error.response.data?.error) {
        details = ` - ${JSON.stringify(error.response.data.error)}`
      }

      return `HTTP ${status} ${statusText}${details}`
    }

    if (error?.code) {
      // Сетевая или timeout ошибка
      return `Network error: ${error.code} - ${error.message}`
    }

    if (error?.message) {
      return error.message
    }

    return "Unknown error"
  }
}
