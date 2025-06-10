// Простой тест адаптера Gemini API
// Использование: node test-gemini-adapter.js YOUR_API_KEY

class GeminiAdapter {
  constructor() {
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models'
    this.model = 'gemini-2.0-flash'
    // Конструктор не требует API ключ - он передается при каждом вызове
  }

  async generateContent(apiKey, prompt, conversationHistory, systemPrompt, customConfig) {
    try {
      // Подготавливаем содержимое запроса
      const contents = []

      // Добавляем системный промпт если есть (как первое user сообщение)
      if (systemPrompt) {
        contents.push({
          role: 'user',
          parts: [{ text: systemPrompt }]
        })
      }

      // Добавляем историю разговора если есть
      if (conversationHistory && conversationHistory.length > 0) {
        contents.push(...conversationHistory)
      }

      // Добавляем новый промпт пользователя
      contents.push({
        role: 'user',
        parts: [{ text: prompt }]
      })

      // Объединяем конфигурацию по умолчанию с пользовательской
      const defaultConfig = {
        temperature: 1.0,
        maxOutputTokens: 800,
        topP: 0.8,
        topK: 10,
        stopSequences: ["Title"]
      }

      const generationConfig = {
        ...defaultConfig,
        ...customConfig
      }

      const requestBody = { 
        contents,
        generationConfig
      }

      // Валидация API ключа
      if (!apiKey) {
        throw new Error('Gemini API key is required')
      }

      // Формируем URL с API ключом
      const url = `${this.baseUrl}/${this.model}:generateContent?key=${apiKey}`

      console.log('🔗 Отправляю запрос:', url.replace(apiKey, 'API_KEY'))
      console.log('📝 Prompt:', prompt)
      if (systemPrompt) {
        console.log('⚙️ System Prompt:', systemPrompt)
      }
      if (conversationHistory && conversationHistory.length > 0) {
        console.log('📚 История разговора:', conversationHistory.length, 'сообщений')
      }

      // Выполняем запрос
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      })

      console.log('📡 Response status:', response.status)

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Gemini API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()

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

      throw new Error('No valid response from Gemini API')

    } catch (error) {
      console.error('❌ Gemini API request failed:', error.message)
      throw error
    }
  }

  async testConnection(apiKey) {
    try {
      const response = await this.generateContent(apiKey, 'Hello', undefined, undefined)
      return response.length > 0
    } catch (error) {
      console.error('❌ Connection test failed:', error.message)
      return false
    }
  }

  getModelInfo() {
    return {
      model: this.model,
      baseUrl: this.baseUrl,
      config: {
        temperature: 1.0,
        maxOutputTokens: 800,
        topP: 0.8,
        topK: 10,
        stopSequences: ["Title"]
      }
    }
  }
}

// Основная функция тестирования
async function main() {
  const apiKey = process.argv[2]
  
  if (!apiKey) {
    console.log('❌ Использование: node test-gemini-adapter.js YOUR_API_KEY')
    process.exit(1)
  }

  console.log('🚀 Тестирование Gemini API адаптера...\n')

  const adapter = new GeminiAdapter()

  try {
    // Тест 1: Простой запрос
    console.log('📋 Тест 1: Простой запрос')
    const response1 = await adapter.generateContent(apiKey, 'Объясни как работает ИИ в нескольких словах', undefined, undefined)
    console.log('✅ Ответ:', response1)
    console.log('')

    // Тест 2: С системным промптом
    console.log('📋 Тест 2: С системным промптом')
    const systemPrompt = 'Ты умный помощник в группе разработчиков. Отвечай кратко и по делу.'
    const response2 = await adapter.generateContent(apiKey, 'Что такое Git?', undefined, systemPrompt)
    console.log('✅ Ответ:', response2)
    console.log('')

    // Тест 3: С кастомной конфигурацией
    console.log('📋 Тест 3: С кастомной конфигурацией')
    const customConfig = {
      temperature: 0.5,
      maxOutputTokens: 200,
      topP: 0.9
    }
    const response3 = await adapter.generateContent(apiKey, 'Расскажи анекдот', undefined, undefined, customConfig)
    console.log('✅ Ответ:', response3)
    console.log('')

    // Тест 4: С историей разговора
    console.log('📋 Тест 4: С историей разговора')
    const conversationHistory = [
      {
        role: 'user',
        parts: [{ text: 'Привет! Как дела?' }]
      },
      {
        role: 'model',
        parts: [{ text: 'Привет! У меня всё отлично, спасибо! Как дела у тебя?' }]
      },
      {
        role: 'user',
        parts: [{ text: 'Хорошо! Можешь помочь с программированием?' }]
      },
      {
        role: 'model',
        parts: [{ text: 'Конечно! Я буду рад помочь с программированием. Что именно тебя интересует?' }]
      }
    ]
    const response4 = await adapter.generateContent(apiKey, 'Объясни что такое рекурсия', conversationHistory)
    console.log('✅ Ответ:', response4)
    console.log('')

    // Тест 5: Проверка соединения
    console.log('📋 Тест 5: Проверка соединения')
    const isConnected = await adapter.testConnection(apiKey)
    console.log('✅ Соединение:', isConnected ? 'Работает' : 'Не работает')
    console.log('')

    // Тест 6: Информация о модели и конфигурации
    console.log('📋 Тест 6: Информация о модели')
    const modelInfo = adapter.getModelInfo()
    console.log('✅ Модель:', modelInfo.model)
    console.log('✅ URL:', modelInfo.baseUrl)
    console.log('✅ Конфигурация:', JSON.stringify(modelInfo.config, null, 2))
    console.log('')

    console.log('🎉 Все тесты пройдены успешно!')

  } catch (error) {
    console.error('❌ Ошибка при тестировании:', error.message)
    process.exit(1)
  }
}

// Запуск тестов
main().catch(console.error) 