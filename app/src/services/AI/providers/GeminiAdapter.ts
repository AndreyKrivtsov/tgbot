export interface GeminiMessage {
  role: "user" | "model"
  parts: Array<{
    text: string
  }>
}

interface GeminiRequest {
  contents: GeminiMessage[]
  generationConfig?: {
    stopSequences?: string[]
    temperature?: number
    maxOutputTokens?: number
    topP?: number
    topK?: number
  }
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string
      }>
    }
  }>
  error?: {
    message: string
    code: number
  }
}

export class GeminiAdapter {
  private baseUrl = "https://generativelanguage.googleapis.com/v1beta/models"
  private model = "gemini-2.0-flash"
  private defaultConfig = {
    temperature: 1.0,
    maxOutputTokens: 800,
    topP: 0.8,
    topK: 10,
    stopSequences: ["Title"],
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
    conversationHistory?: GeminiMessage[],
    systemPrompt?: string,
    customConfig?: Partial<typeof this.defaultConfig>,
  ): Promise<string> {
    try {
      // Подготавливаем содержимое запроса
      const contents: GeminiMessage[] = []

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

      const requestBody: GeminiRequest = {
        contents,
        generationConfig,
      }

      // Валидация API ключа
      if (!apiKey) {
        throw new Error("Gemini API key is required")
      }

      // Формируем URL с API ключом
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`

      // Логируем детали HTTP запроса
      console.log(`🌐 [GEMINI HTTP] Making request to: ${this.baseUrl}/${this.model}:generateContent?key=${apiKey.substring(0, 12)}...${apiKey.slice(-4)}`)
      console.log(`📊 [GEMINI HTTP] Request method: POST`)
      console.log(`📋 [GEMINI HTTP] Contents array length: ${contents.length}`)
      console.log(`⚙️ [GEMINI HTTP] Generation config:`, JSON.stringify(generationConfig, null, 2))
      console.log(`📤 [GEMINI HTTP] Full request body:`, JSON.stringify(requestBody, null, 2))

      // Выполняем запрос
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      })

      console.log(`📡 [GEMINI HTTP] Response status: ${response.status} ${response.statusText}`)

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ [GEMINI HTTP] Error response body:`, errorText)
        throw new Error(`Gemini API error (${response.status}): ${errorText}`)
      }

      const data = await response.json() as GeminiResponse

      console.log(`📥 [GEMINI HTTP] Response data:`, JSON.stringify(data, null, 2))

      // Проверяем на ошибки в ответе
      if (data.error) {
        console.error(`❌ [GEMINI HTTP] API error in response:`, data.error)
        throw new Error(`Gemini API error: ${data.error.message} (code: ${data.error.code})`)
      }

      // Извлекаем текст ответа
      if (data.candidates && data.candidates.length > 0) {
        const candidate = data.candidates[0]
        if (candidate && candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
          const part = candidate.content.parts[0]
          if (part && part.text) {
            console.log(`✅ [GEMINI HTTP] Successfully extracted response text (${part.text.length} characters)`)
            return part.text
          }
        }
      }

      console.error(`❌ [GEMINI HTTP] No valid response structure found`)
      throw new Error("No valid response from Gemini API")
    } catch (error) {
      console.error("Gemini API request failed:", error)
      throw error
    }
  }

  /**
   * Проверить соединение с API
   */
  async testConnection(apiKey: string): Promise<boolean> {
    try {
      const response = await this.generateContent(apiKey, "Hello")
      return response.length > 0
    } catch (error) {
      console.error("Gemini API connection test failed:", error)
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
