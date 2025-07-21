# Руководство по инструментам модерации для Gemini AI

## Обзор

Система инструментов модерации позволяет Gemini AI автоматически выполнять модерационные действия в Telegram чатах. ИИ может самостоятельно принимать решения о модерации на основе контекста разговора и правил чата.

## Архитектура

```
Gemini API ← → AIChatServiceRefactored ← → ModerationTools ← → EventBus ← → ModerationEventHandler
                                                                            ↓
                                                                      TelegramBot API
```

### Компоненты

1. **ModerationTools** - Инструменты для вызова функций модерации
2. **AIChatServiceRefactored** - Интегрирует инструменты с Gemini API
3. **EventBus** - Система событий для выполнения действий
4. **ModerationEventHandler** - Обработчик событий модерации

## Доступные функции

### 1. `delete_message` - Удаление сообщения

**Описание:** Удаляет сообщение в чате при нарушении правил.

**Параметры:**
- `chat_id` (integer, обязательный) - ID чата
- `message_id` (integer, обязательный) - ID сообщения для удаления
- `reason` (string, опциональный) - Причина удаления

**Пример использования Gemini:**
```json
{
  "type": "function_call",
  "function_call": {
    "name": "delete_message",
    "args": {
      "chat_id": -1001234567890,
      "message_id": 12345,
      "reason": "Спам сообщение"
    }
  }
}
```

### 2. `mute_user` - Отключение пользователя

**Описание:** Запрещает пользователю отправлять сообщения на определенное время.

**Параметры:**
- `chat_id` (integer, обязательный) - ID чата
- `user_id` (integer, обязательный) - ID пользователя
- `duration` (integer, опциональный) - Длительность в секундах (по умолчанию 3600 = 1 час)
- `reason` (string, опциональный) - Причина отключения

**Пример:**
```json
{
  "type": "function_call",
  "function_call": {
    "name": "mute_user",
    "args": {
      "chat_id": -1001234567890,
      "user_id": 123456789,
      "duration": 1800,
      "reason": "Нарушение правил чата"
    }
  }
}
```

### 3. `unmute_user` - Включение пользователя

**Описание:** Снимает ограничения с пользователя.

**Параметры:**
- `chat_id` (integer, обязательный) - ID чата
- `user_id` (integer, обязательный) - ID пользователя
- `reason` (string, опциональный) - Причина снятия ограничений

### 4. `ban_user` - Блокировка пользователя

**Описание:** Блокирует пользователя в чате (временно или навсегда).

**Параметры:**
- `chat_id` (integer, обязательный) - ID чата
- `user_id` (integer, обязательный) - ID пользователя
- `duration` (integer, опциональный) - Длительность в секундах (если не указано - постоянная блокировка)
- `reason` (string, опциональный) - Причина блокировки

### 5. `unban_user` - Разблокировка пользователя

**Описание:** Снимает блокировку с пользователя.

**Параметры:**
- `chat_id` (integer, обязательный) - ID чата
- `user_id` (integer, обязательный) - ID пользователя
- `reason` (string, опциональный) - Причина разблокировки

## Настройка в системном промпте

Для правильной работы инструментов рекомендуется добавить в системный промпт:

```
Ты модератор чата с полномочиями по управлению пользователями.

ДОСТУПНЫЕ ИНСТРУМЕНТЫ МОДЕРАЦИИ:
- delete_message - удаление неподходящих сообщений
- mute_user - временное отключение пользователей (1-24 часа)
- ban_user - блокировка за серьезные нарушения
- unmute_user/unban_user - снятие ограничений

ПРИНЦИПЫ МОДЕРАЦИИ:
1. Сначала предупреждение, потом действие
2. Градация: предупреждение → мут → бан
3. Обязательно указывай причину действий
4. Будь справедливым но строгим

КОГДА ИСПОЛЬЗОВАТЬ:
- Спам, реклама → delete_message + mute_user
- Оскорбления → mute_user (30-60 мин)
- Серьезные нарушения → ban_user
- Просьба о разбане → unban_user (если обоснованно)
```

## Логирование и мониторинг

Все действия логируются:

```typescript
// Успешное выполнение
[INFO] 🗑️ Message 12345 deletion requested in chat -1001234567890. Reason: Спам сообщение

// Ошибка выполнения
[ERROR] Error deleting message: Insufficient permissions
```

## Безопасность

### Ограничения доступа
- Функции доступны только ИИ в контексте модерации
- Проверка прав администратора в `ModerationEventHandler`
- Валидация параметров запросов

### Аудит действий
- Все модерационные действия логируются
- Сохранение причин действий
- Возможность отследить источник решения (ИИ)

## Пример интеграции

```typescript
// В вашем чат-боте
const moderationTools = new ModerationTools(eventBus, logger)
const functionDeclarations = moderationTools.getFunctionDeclarations()

// Передача в Gemini API
const response = await geminiAdapter.generateContent(
  apiKey,
  userMessage,
  conversationHistory,
  systemPrompt,
  {},
  functionDeclarations // ← Инструменты модерации
)

// Обработка вызова функции
if (response.includes("\"type\":\"function_call\"")) {
  const functionCall = JSON.parse(response)
  const result = await moderationTools.executeFunction(
    functionCall.function_call.name,
    functionCall.function_call.args
  )

  console.log(result.message) // "Пользователь отключен на 30 минут. Причина: Спам"
}
```

## Расширение функционала

Для добавления новых инструментов модерации:

1. **Добавить в ModerationTools:**
```typescript
async kickUser(chatId: number, userId: number): Promise<ModerationResult> {
  const event: KickUserEvent = { chatId, userId, reason: "Kicked by AI" };
  this.eventBus.emit("moderation.kick", event);
  return { success: true, message: "Пользователь исключен из чата" };
}
```

2. **Добавить в getFunctionDeclarations:**
```typescript
{
  name: "kick_user",
  description: "Исключает пользователя из чата (кик)",
  parameters: { /* параметры */ }
}
```

3. **Добавить в executeFunction:**
```typescript
case "kick_user":
  return this.kickUser(args.chat_id, args.user_id)
```

## Тестирование

Тестирование инструментов можно проводить через:

1. **Unit тесты:**
```typescript
describe("ModerationTools", () => {
  it("should delete message successfully", async () => {
    const result = await moderationTools.deleteMessage(chatId, messageId, "Test")
    expect(result.success).toBe(true)
  })
})
```

2. **Интеграционные тесты с EventBus**
3. **E2E тесты с реальным Telegram API**

## Заключение

Инструменты модерации предоставляют Gemini AI мощные возможности для автоматической модерации чатов. Система спроектирована с учетом безопасности, аудита и расширяемости.
