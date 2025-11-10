import type { Logger } from "../../helpers/Logger.js"
import type { ChatContext } from "./ChatContextManager.js"
import { AI_CHAT_CONFIG } from "../../constants.js"
import type { LLMPort } from "../ai/llm.models.js"
import { prepareMessages } from "../ai/chat.messageBuilder.js"
import { formatResponse as formatRespHelper, validateResponse as validateRespHelper } from "../ai/chat.responseFormatter.js"
import { getChatGenerationLimits, getChatModel } from "../ai/chat.policy.js"
import { isFunctionCall as isFnCall, parseFunctionCall as parseFnCall } from "../ai/chat.functions.js"

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
 * Интерфейс для AIResponseService
 */
export interface IAIResponseService {
  generateResponse: (params: AIResponseParams) => Promise<AIResponseResult>
  formatResponse: (response: string) => string
  validateResponse: (response: string) => { isValid: boolean, reason?: string }
}

/**
 * Сервис для генерации AI ответов
 */
export class AIResponseService implements IAIResponseService {
  private logger: Logger
  private llm: LLMPort

  constructor(logger: Logger, llm: LLMPort) {
    this.logger = logger
    this.llm = llm
  }

  /**
   * Генерация ответа с использованием AI провайдера
   */
  async generateResponse(params: AIResponseParams): Promise<AIResponseResult> {
    const { message, context, systemPrompt, apiKey, maxRetries: _maxRetries = 3 } = params
    const startTime = Date.now()

    this.logger.d(`Generating AI response for context ${context.chatId}`)

    try {
      const messages = prepareMessages(context, message, systemPrompt)
      const chat = await this.llm.generateChatResponse({
        chatId: context.chatId,
        messages,
        systemPrompt,
        model: getChatModel(),
        maxTokens: getChatGenerationLimits().maxTokens,
        temperature: getChatGenerationLimits().temperature,
        apiKey,
      })
      const response = chat.content

      const processingTime = Date.now() - startTime

      // Проверяем на вызов функции
      if (isFnCall(response)) {
        const functionCall = parseFnCall(response)
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
  /**
   * Форматирование ответа
   */
  formatResponse(response: string): string {
    return formatRespHelper(response)
  }

  /**
   * Валидация ответа
   */
  validateResponse(response: string): { isValid: boolean, reason?: string } {
    return validateRespHelper(response)
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
