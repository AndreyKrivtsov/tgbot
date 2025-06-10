# 🤖 Gemini API Адаптер

## 📋 Описание

Простой адаптер для работы с Google Gemini API. Выполняет HTTP запросы к API в правильном формате и обрабатывает ответы.

## 🚀 Использование

### Базовое использование:

```typescript
import { GeminiAdapter } from './services/ai/providers/GeminiAdapter.js'

// Создание адаптера
const adapter = new GeminiAdapter()

// Простой запрос (API ключ передается при вызове)
const response = await adapter.generateContent('your-api-key', 'Объясни как работает ИИ')
console.log(response)

// Запрос с системным промптом
const systemPrompt = 'Ты помощник в группе разработчиков. Отвечай кратко.'
const response2 = await adapter.generateContent('your-api-key', 'Что такое Git?', undefined, systemPrompt)
console.log(response2)

// Запрос с историей разговора
const conversationHistory = [
  {
    role: 'user',
    parts: [{ text: 'Привет! Как дела?' }]
  },
  {
    role: 'model',
    parts: [{ text: 'Привет! У меня всё отлично, спасибо!' }]
  }
]
const response3 = await adapter.generateContent('your-api-key', 'Можешь помочь с кодом?', conversationHistory)
console.log(response3)

// Запрос с кастомной конфигурацией
const customConfig = {
  temperature: 0.5,
  maxOutputTokens: 200,
  topP: 0.9
}
const response4 = await adapter.generateContent('your-api-key', 'Расскажи анекдот', undefined, undefined, customConfig)
console.log(response4)
```

### Интеграция с AIChatService:

```typescript
// В AIChatService автоматически используется адаптер
const chatId = 123456789
const apiKey = await this.getApiKeyForChat(chatId) // Индивидуальный или глобальный ключ
const systemPrompt = await this.getSystemPromptForChat(chatId)

// Получаем историю разговора из контекста
const context = this.getOrCreateContext(chatId.toString())
const conversationHistory = context.messages.map(msg => ({
  role: msg.role === 'assistant' ? 'model' : 'user',
  parts: [{ text: msg.content }]
}))

const geminiAdapter = new GeminiAdapter()
const response = await geminiAdapter.generateContent(apiKey, message, conversationHistory, systemPrompt)
```

## ⚙️ Конфигурация генерации

Адаптер поддерживает следующие параметры для управления генерацией ответов:

### GenerationConfig

```typescript
interface GenerationConfig {
  temperature: number        // Творческость ответов (0.0-2.0, по умолчанию: 1.0)
  maxOutputTokens: number   // Максимальное количество токенов в ответе (по умолчанию: 800)
  topP: number             // Nucleus sampling (0.0-1.0, по умолчанию: 0.8)
  topK: number             // Top-K sampling (по умолчанию: 10)
  stopSequences: string[]  // Последовательности для остановки генерации (по умолчанию: ["Title"])
}
```

### Настройки по умолчанию

```typescript
const defaultConfig = {
  temperature: 1.0,        // Сбалансированная творческость
  maxOutputTokens: 800,    // Достаточно для развернутых ответов
  topP: 0.8,              // Разнообразие в ответах
  topK: 10,               // Ограничение выбора слов
  stopSequences: ["Title"] // Остановка на заголовках
}
```

## 🔧 API

### Конструктор
```typescript
new GeminiAdapter()
```
Создает новый экземпляр адаптера. API ключ передается при каждом вызове `generateContent()`.

### Методы

#### `generateContent(apiKey: string, prompt: string, conversationHistory?: GeminiMessage[], systemPrompt?: string, customConfig?: GenerationConfig): Promise<string>`
Отправляет запрос к Gemini API и возвращает ответ.

**Параметры:**
- `apiKey` - API ключ для Google Gemini (индивидуальный для каждого чата)
- `prompt` - основной текст запроса
- `conversationHistory` - опциональная история предыдущих сообщений в формате Gemini
- `systemPrompt` - опциональный системный промпт для настройки поведения ИИ
- `customConfig` - опциональная конфигурация генерации (переопределяет настройки по умолчанию)

**Возвращает:** Promise с текстом ответа от ИИ

#### `testConnection(apiKey: string): Promise<boolean>`
Проверяет соединение с API, отправляя тестовый запрос.

**Параметры:**
- `apiKey` - API ключ для тестирования

**Возвращает:** Promise с булевым значением (true = соединение работает)

#### `setModel(modelName: string): void`
Устанавливает другую модель для использования.

**Параметры:**
- `modelName` - название модели (по умолчанию: 'gemini-2.0-flash')

#### `updateDefaultConfig(config: Partial<GenerationConfig>): void`
Обновляет конфигурацию генерации по умолчанию.

**Параметры:**
- `config` - частичная конфигурация для обновления

#### `getDefaultConfig(): GenerationConfig`
Возвращает текущую конфигурацию генерации по умолчанию.

#### `getModelInfo(): { model: string; baseUrl: string; config: GenerationConfig }`
Возвращает информацию о текущей модели, базовом URL и конфигурации.

## 📡 Формат запроса

Адаптер отправляет запросы в формате, соответствующем Gemini API:

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        {
          "text": "System prompt (если указан)"
        }
      ]
    },
    {
      "role": "user",
      "parts": [
        {
          "text": "Привет! Как дела?"
        }
      ]
    },
    {
      "role": "model",
      "parts": [
        {
          "text": "Привет! У меня всё отлично, спасибо!"
        }
      ]
    },
    {
      "role": "user",
      "parts": [
        {
          "text": "Новый вопрос пользователя"
        }
      ]
    }
  ],
  "generationConfig": {
    "stopSequences": ["Title"],
    "temperature": 1.0,
    "maxOutputTokens": 800,
    "topP": 0.8,
    "topK": 10
  }
}
```

### Структура истории

Каждое сообщение в истории содержит:
- **role**: `"user"` для сообщений пользователя, `"model"` для ответов ИИ
- **parts**: массив с текстовым содержимым сообщения

Порядок важен:
1. Системный промпт (опционально, role: "user")
2. История предыдущих сообщений
3. Новое сообщение пользователя (role: "user")

## 🛠️ Тестирование

Для тестирования адаптера используйте скрипт:

```bash
node test-gemini-adapter.js YOUR_API_KEY
```

Скрипт выполнит шесть тестов:
1. Простой запрос без системного промпта
2. Запрос с системным промптом
3. Запрос с кастомной конфигурацией генерации
4. Запрос с историей разговора (демонстрация контекста)
5. Проверка соединения
6. Отображение информации о модели и конфигурации

## ⚠️ Обработка ошибок

Адаптер обрабатывает следующие типы ошибок:

- **HTTP ошибки** (4xx, 5xx) - выбрасывает исключение с кодом статуса
- **API ошибки** - обрабатывает поле `error` в ответе от Gemini
- **Пустые ответы** - проверяет наличие валидного контента в ответе
- **Сетевые ошибки** - обрабатывает ошибки fetch

Все ошибки логируются в консоль и выбрасываются дальше для обработки в вызывающем коде.

## 🔗 Интеграция с чатами

В системе каждый чат может иметь:
- **Индивидуальный API ключ** - хранится в `chats.gemini_api_key`
- **Системный промпт** - хранится в `chats.system_prompt`
- **Настройки лимитов** - `daily_limit`, `throttle_delay`

Если у чата нет индивидуального ключа, используется глобальный из конфигурации.

## 📊 Производительность

- **Throttling**: задержка между запросами настраивается для каждого чата
- **Retry логика**: до 3 попыток при ошибках
- **Кэширование**: настройки чатов кэшируются в памяти
- **Контекст**: ограничен 600 символами для оптимизации

## 🔒 Безопасность

- API ключи хранятся в базе данных
- Логи не содержат полных API ключей (маскируются)
- Лимиты запросов защищают от злоупотреблений
- Валидация входных данных 

### Структура сообщений

```typescript
interface GeminiMessage {
  role: 'user' | 'model'  // 'user' для пользователя, 'model' для ИИ
  parts: Array<{
    text: string
  }>
}
``` 