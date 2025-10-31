import { axiosWithProxy } from "../../../helpers/axiosWithProxy.js"
import type { IAIProvider } from "./IAIProvider.js"
import { AI_CHAT_CONFIG } from "../../../constants.js"
import type { Logger } from "../../../helpers/Logger.js"

interface DefaultConfig {
  temperature: number
  maxOutputTokens: number
  topP: number
  topK: number
  stopSequences: string[]
}

export class GeminiAdapter implements IAIProvider {
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models"
  private model = "gemma-3-27b-it"
  // private model = "gemini-2.0-flash"
  private requestTimeoutMs: number = AI_CHAT_CONFIG.AI_REQUEST_TIMEOUT_MS
  private logger?: Logger
  private defaultConfig: DefaultConfig = {
    temperature: 2.0,
    maxOutputTokens: 800,
    topP: 0.7,
    topK: 20,
    stopSequences: [],
  }

  constructor(logger?: Logger) {
    this.logger = logger
  }

  /**
   * Отправить запрос к Gemini API
   */
  async generateContent(
    apiKey: string,
    prompt: string,
    conversationHistory?: any[],
    systemPrompt?: string,
    customConfig?: object,
    tools?: any[],
  ): Promise<string> {
    // Подготавливаем содержимое запроса
    const contents: any[] = []

    // 1) Системное сообщение — строго первым элементом
    if (systemPrompt && systemPrompt.trim().length > 0) {
      contents.push({
        role: "user",
        parts: [{ text: systemPrompt }],
      })
    }

    // 2) История разговора (только валидные роли и контент)
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        if (!msg?.role || !msg?.content) {
          continue
        }
        // Конвертируем в формат Gemini API
        contents.push({
          role: msg.role, // "user" или "model"
          parts: [{ text: msg.content }],
        })
      }
    }

    // 3) Текущее сообщение пользователя — последним
    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    })

    // Объединяем конфигурацию по умолчанию с пользовательской
    const generationConfig = {
      ...this.defaultConfig,
      ...customConfig,
    }

    const requestBody: any = {
      contents,
      generationConfig,
    }

    // Добавляем инструменты если они предоставлены
    if (tools && tools.length > 0) {
      requestBody.tools = [{
        function_declarations: tools,
      }]

      // Настраиваем режим использования инструментов
      requestBody.tool_config = {
        function_calling_config: {
          mode: "AUTO", // Автоматический выбор: ответ или вызов функции
        },
      }
    }

    // Дебаг логирование
    if (this.logger) {
      this.logger.d(`[GeminiAdapter] Request: ${contents.length} messages, ${JSON.stringify(requestBody).length} chars`)
      this.logger.d(`[GeminiAdapter] Roles in request: ${contents.map(c => c.role).join(", ")}`)
    }

    // Валидация API ключа
    if (!apiKey) {
      throw new Error("Gemini API key is required")
    }

    // Формируем URL с API ключом
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`

    try {
      // Выполняем запрос с таймаутом
      const response = await axiosWithProxy({
        url,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        data: JSON.stringify(requestBody),
        responseType: "json",
        timeout: this.requestTimeoutMs,
      })

      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Gemini API error (${response.status}): ${response.statusText}`)
      }

      const result = this.parseResponse(response.data)

      // Дебаг логирование результата
      if (this.logger) {
        this.logger.d(`[GeminiAdapter] Response: ${result.length} chars`)
      }

      return result
    } catch (error: any) {
      // Логируем ошибку для дебага
      if (this.logger) {
        this.logger.d(`[GeminiAdapter] Error: ${error.message}`)
      }

      // Проверяем на ошибку таймаута
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        throw new Error(`Request timeout (${this.requestTimeoutMs}ms): Gemini API did not respond in time`)
      }

      // Проверяем на сетевые ошибки
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        throw new Error(`Network error: Unable to connect to Gemini API (${error.message})`)
      }

      // Передаем остальные ошибки как есть
      throw error
    }
  }

  /**
   * Парсинг ответа от Gemini API
   */
  private parseResponse(data: any): string {
    // Проверяем на ошибки в ответе
    if (data.error) {
      const errorMsg = `Gemini API error: ${data.error.message || "Unknown error"}`
      const errorCode = data.error.code ? ` (code: ${data.error.code})` : ""
      const errorStatus = data.error.status ? ` (status: ${data.error.status})` : ""
      throw new Error(`${errorMsg}${errorCode}${errorStatus}`)
    }

    // Извлекаем текст ответа
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0]

      // Проверяем на проблемы с кандидатом
      if (candidate.finishReason && candidate.finishReason !== "STOP") {
        throw new Error(`Response generation stopped: ${candidate.finishReason}`)
      }

      if (candidate && candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const part = candidate.content.parts[0]

        // Проверяем на вызов функции
        if (part.functionCall) {
          // Возвращаем информацию о вызове функции как JSON строку
          return JSON.stringify({
            type: "function_call",
            function_call: {
              name: part.functionCall.name,
              args: part.functionCall.args || {},
            },
          })
        }

        // Обычный текстовый ответ
        if (part && part.text) {
          return part.text
        }
      }
    }

    // Дополнительная диагностика
    const candidatesInfo = data.candidates
      ? `Found ${data.candidates.length} candidates`
      : "No candidates found"

    throw new Error(`No valid response from Gemini API. ${candidatesInfo}. Raw response keys: ${Object.keys(data).join(", ")}`)
  }
}
