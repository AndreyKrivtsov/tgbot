# Улучшение таймаутов в Gemini адаптере

## Проблема

Gemini адаптер не имел таймаутов для запросов, что могло приводить к зависанию бота при:
- Проблемах с сетью
- Медленном ответе от Gemini API
- Недоступности сервиса

## Решение

Добавлен **таймаут 5 секунд** для всех запросов к Gemini API с улучшенной обработкой ошибок.

### Изменения в коде

#### 1. Константа в конфигурации
```typescript
// app/src/constants.ts
export const AI_CHAT_CONFIG = {
  // ...
  AI_REQUEST_TIMEOUT_MS: 5000, // 5 секунд - таймаут запросов к AI провайдеру
  // ...
}
```

#### 2. Обновленный GeminiAdapter
```typescript
export class GeminiAdapter implements IAIProvider {
  private requestTimeoutMs: number = AI_CHAT_CONFIG.AI_REQUEST_TIMEOUT_MS

  async generateContent(...) {
    try {
      const response = await axiosWithProxy({
        // ...
        timeout: this.requestTimeoutMs, // Добавлен таймаут
      })

      return this.parseResponse(response.data)
    } catch (error: any) {
      // Специальная обработка ошибок таймаута
      if (error.code === "ECONNABORTED" || error.message?.includes("timeout")) {
        throw new Error(`Request timeout (${this.requestTimeoutMs}ms): Gemini API did not respond in time`)
      }

      // Обработка сетевых ошибок
      if (error.code === "ECONNREFUSED" || error.code === "ENOTFOUND") {
        throw new Error(`Network error: Unable to connect to Gemini API (${error.message})`)
      }

      throw error
    }
  }
}
```

#### 3. Новые методы управления таймаутом
```typescript
// Установить новый таймаут
geminiAdapter.setRequestTimeout(10000) // 10 секунд

// Получить текущий таймаут
const timeout = geminiAdapter.getRequestTimeout()

// Информация о модели включает таймаут
const info = geminiAdapter.getModelInfo()
console.log(info.timeoutMs) // 5000
```

### Типы ошибок

Теперь адаптер различает следующие типы ошибок:

1. **Ошибки таймаута**
   ```
   Request timeout (5000ms): Gemini API did not respond in time
   ```

2. **Сетевые ошибки**
   ```
   Network error: Unable to connect to Gemini API (ECONNREFUSED)
   ```

3. **API ошибки**
   ```
   Gemini API error: API quota exceeded (code: 429)
   ```

### Преимущества

1. **Предотвращение зависаний**: Запросы автоматически отменяются через 5 секунд
2. **Лучшая отладка**: Четкие сообщения об ошибках для разных типов проблем
3. **Настраиваемость**: Таймаут можно изменить через константы или методы
4. **Мониторинг**: Информация о таймауте доступна в статистике

### Использование

#### Базовое использование
```typescript
const adapter = new GeminiAdapter()
// Использует таймаут по умолчанию (5 сек)
const response = await adapter.generateContent(apiKey, "Hello")
```

#### Настройка таймаута
```typescript
const adapter = new GeminiAdapter()
adapter.setRequestTimeout(10000) // 10 секунд для сложных запросов
const response = await adapter.generateContent(apiKey, longPrompt)
```

#### Обработка ошибок
```typescript
try {
  const response = await adapter.generateContent(apiKey, prompt)
  console.log(response)
} catch (error) {
  if (error.message.includes("timeout")) {
    console.log("API не ответил вовремя, попробуйте позже")
  } else if (error.message.includes("Network error")) {
    console.log("Проблемы с сетью")
  } else {
    console.log("Ошибка API:", error.message)
  }
}
```

### Тестирование

Добавлены unit-тесты для проверки:
- Правильной передачи таймаута в axios
- Обработки ошибок таймаута
- Обработки сетевых ошибок
- Настройки пользовательского таймаута

```bash
npm test -- GeminiAdapter.test.ts
```

### Конфигурация

Таймаут можно изменить глобально в `constants.ts`:

```typescript
export const AI_CHAT_CONFIG = {
  AI_REQUEST_TIMEOUT_MS: 10000, // Увеличить до 10 секунд
}
```

Или для конкретного экземпляра:

```typescript
adapter.setRequestTimeout(15000) // 15 секунд
```

## Заключение

Добавление таймаутов значительно повышает надежность системы и улучшает пользовательский опыт, предотвращая долгие ожидания и зависания бота.
