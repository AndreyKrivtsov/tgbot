# 🤖 Архитектура ИИ чат-бота для групп

## 📋 Обзор

Каждая группа в Telegram может подключить чат-бота с ИИ, указав свой собственный API ключ для Gemini. Система поддерживает индивидуальные настройки для каждой группы и управление администраторами.

## 🗄️ Схема базы данных

### Основные принципы:
1. **Минимальная схема** - только необходимые таблицы и поля
2. **Контекст не очищается** - сохраняется навсегда, но ограничен по размеру (600 символов)
3. **Индивидуальные настройки** - каждая группа может иметь свой API ключ и настройки
4. **Управление администраторами** - система ролей для управления группой

### Ключевые таблицы:

#### `chats` - Чаты с настройками ИИ
```sql
- id (bigint) - Telegram chat ID
- type - тип чата (group, supergroup, private)
- title - название группы
- gemini_api_key - API ключ для Gemini (может быть NULL для использования глобального)
- system_prompt - контекст группы для AI
- is_ai_enabled - включен ли ИИ в группе
- daily_limit - дневной лимит запросов к AI (по умолчанию 1500)
- throttle_delay - задержка между запросами в мс (по умолчанию 3000)
- max_context_characters - максимальная длина контекста в символах (по умолчанию 600)
```

#### `group_admins` - Администраторы групп
```sql
- group_id, user_id - составной ключ
- role - роль (admin, owner, moderator)
- permissions - разрешения администратора
```

#### `ai_contexts` - Контексты ИИ
```sql
- chat_id - ID чата
- messages - история сообщений как единый текст (ограничен 600 символами)
- total_request_count - общий счетчик запросов
- daily_request_count - дневной счетчик запросов
- context_length - текущая длина контекста в символах
```

## 🚀 Логика работы

### 1. Подключение группы
1. Администратор группы добавляет бота
2. Бот автоматически создает запись в `chats` с настройками по умолчанию
3. Администратор может настроить свой API ключ и другие параметры

### 2. Обработка сообщений
```typescript
// Проверка обращения к боту
if (isBotMention(message)) {
  // Получение настроек чата
  const chatSettings = await getChatSettings(chatId)

  // Использование индивидуального или глобального API ключа
  const apiKey = chatSettings.geminiApiKey || config.AI_API_KEY

  // Проверка лимитов
  const limits = await getChatLimits(chatId)

  // Обработка с учетом настроек группы
  await processWithCustomSettings(message, chatSettings)
}
```

### 3. Управление контекстом
- **Размер контекста**: ограничен 600 символами
- **Никогда не очищается**: контекст сохраняется навсегда
- **Обрезка**: при превышении лимита удаляются старые сообщения, сохраняя последние

```typescript
// Обрезка контекста по символам
async trimContextByCharacters(context, maxCharacters) {
  const messagesText = context.messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n')

  if (messagesText.length > maxCharacters) {
    // Оставляем последние maxCharacters символов
    const trimmed = messagesText.slice(-maxCharacters)
    // Парсим обратно в сообщения
    context.messages = parseMessages(trimmed)
  }
}
```

## ⚙️ API для управления группами

### Основные методы:

```typescript
// Получить настройки чата
getChatSettings(chatId: number): Promise<Chat | null>

// Обновить настройки (только для администраторов)
updateChatSettings(chatId: number, userId: number, updates: Partial<ChatSettings>): Promise<boolean>

// Управление администраторами
addAdmin(chatId: number, userId: number, role: string): Promise<boolean>
removeAdmin(chatId: number, userId: number): Promise<boolean>
isChatAdmin(chatId: number, userId: number): Promise<boolean>

// Управление ИИ
toggleAi(chatId: number, enabled: boolean): Promise<boolean>
setApiKey(chatId: number, apiKey: string | null): Promise<boolean>
setSystemPrompt(chatId: number, prompt: string | null): Promise<boolean>
```

## 🔧 Настройки по умолчанию

При создании новой группы применяются следующие настройки:

```typescript
const defaultSettings = {
  isAiEnabled: true, // ИИ включен
  dailyLimit: 1500, // 1500 запросов в день
  throttleDelay: 3000, // 3 секунды между запросами
  maxContextCharacters: 600, // 600 символов контекста
  geminiApiKey: null, // Использовать глобальный ключ
  systemPrompt: null // Без специального промпта
}
```

## 🛡️ Безопасность

1. **Проверка администратора**: перед изменением настроек проверяется роль пользователя
2. **Изоляция групп**: каждая группа имеет изолированные настройки и контекст
3. **Лимиты запросов**: защита от злоупотреблений через дневные лимиты
4. **Throttling**: задержка между запросами для защиты API

## 📊 Мониторинг

Система отслеживает:
- Количество запросов к ИИ по группам
- Использование API ключей
- Активность администраторов
- Размер контекстов

## 🔄 Миграция

При обновлении существующих групп:
1. Автоматически создаются записи в `chats` с настройками по умолчанию
2. Существующие контексты мигрируются в новый формат
3. Сохраняется обратная совместимость

## 💡 Примеры использования

### Настройка группы с собственным API ключом:
```typescript
// Администратор устанавливает свой ключ
await updateChatSettings(chatId, adminUserId, {
  geminiApiKey: "your-custom-api-key",
  systemPrompt: "Ты помощник в группе разработчиков. Отвечай кратко и по делу.",
  dailyLimit: 500 // Ограничение для экономии
})
```

### Временное отключение ИИ:
```typescript
// Отключить ИИ в группе
await toggleAi(chatId, false)
```

Такая архитектура обеспечивает максимальную гибкость для каждой группы при минимальной сложности схемы данных.
