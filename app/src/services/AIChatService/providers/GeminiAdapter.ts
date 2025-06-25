import { axiosWithProxy } from "../../../helpers/axiosWithProxy.js"
import type { IAIProvider } from "./IAIProvider.js"

export interface GeminiMessage {
  role: "user" | "model"
  parts: Array<{
    text: string
  }>
}

export class GeminiAdapter implements IAIProvider {
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models"
  private model = "gemma-3-27b-it"
  private defaultConfig = {
    temperature: 1.0,
    maxOutputTokens: 800,
    topP: 0.8,
    topK: 10,
    stopSequences: [],
  }

  constructor() {
    // Конструктор не требует API ключ - он передается при каждом вызове
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
  ): Promise<string> {
    // Подготавливаем содержимое запроса
    const contents: any[] = []

    // Добавляем системный промпт если есть (как первое user сообщение)
    if (systemPrompt) {
      contents.push({
        role: "user",
        parts: [{ text: systemPrompt }],
      })
    }

    // Добавляем историю разговора если есть
    if (conversationHistory && conversationHistory.length > 0) {
      contents.push(...conversationHistory)
    }

    // Добавляем новый промпт пользователя
    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    })

    // Объединяем конфигурацию по умолчанию с пользовательской
    const generationConfig = {
      ...this.defaultConfig,
      ...customConfig,
    }

    const requestBody = {
      contents,
      generationConfig,
    }

    // Валидация API ключа
    if (!apiKey) {
      throw new Error("Gemini API key is required")
    }

    // Формируем URL с API ключом
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`

    // Выполняем запрос
    const response = await axiosWithProxy({
      url,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      data: JSON.stringify(requestBody),
      responseType: "json",
    })

    if (response.status < 200 || response.status >= 300) {
      throw new Error(`Gemini API error (${response.status}): ${response.statusText}`)
    }

    const data = response.data

    // Проверяем на ошибки в ответе
    if (data.error) {
      throw new Error(`Gemini API error: ${data.error.message} (code: ${data.error.code})`)
    }

    // Извлекаем текст ответа
    if (data.candidates && data.candidates.length > 0) {
      const candidate = data.candidates[0]
      if (candidate && candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const part = candidate.content.parts[0]
        if (part && part.text) {
          return part.text
        }
      }
    }

    throw new Error("No valid response from Gemini API")
  }

  /**
   * Проверить соединение с API
   */
  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const response = await this.generateContent(apiKey, "Hello")
      return response.length > 0
    } catch {
      return false
    }
  }

  /**
   * Установить другую модель
   */
  setModel(modelName: string): void {
    this.model = modelName
  }

  /**
   * Обновить конфигурацию генерации по умолчанию
   */
  updateDefaultConfig(config: Partial<{
    temperature: number
    maxOutputTokens: number
    topP: number
    topK: number
    stopSequences: string[]
  }>): void {
    this.defaultConfig = {
      ...this.defaultConfig,
      ...config,
    }
  }

  /**
   * Получить текущую конфигурацию по умолчанию
   */
  getDefaultConfig() {
    return { ...this.defaultConfig }
  }

  /**
   * Получить информацию о текущей модели
   */
  getModelInfo() {
    return {
      model: this.model,
      baseUrl: this.baseUrl,
      config: this.getDefaultConfig(),
    }
  }
}
