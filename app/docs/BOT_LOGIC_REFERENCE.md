# 🤖 Логика работы Telegram Бота - Краткий справочник

## 🎯 Основные функции

### 1. 🔐 Капча (CaptchaService)
**Цель**: Проверка новых пользователей математическими задачами

**Когда срабатывает**:
- Новый пользователь присоединяется к чату (`chat_member` event)
- Системное сообщение о новом участнике (`new_chat_members`)

**Алгоритм**:
```
1. Пользователь присоединяется → event chat_member
2. Генерируется пример: X + Y = ?
3. Создается InlineKeyboard с 4 вариантами ответа
4. Пользователь ограничивается (can_send_messages: false)
5. Запускается таймер 60 секунд
6. Ожидание ответа через callback_query
7. Если правильно → снятие ограничений + приветствие
8. Если неправильно или таймаут → бан на 1 час
```

**Генерация примеров**:
- Числа от 1 до 10
- Только сложение
- 4 варианта ответа (3 неправильных + 1 правильный)
- Перемешивание позиций

### 2. 🛡️ Антиспам (AntiSpamService)
**Цель**: Фильтрация спам-сообщений у новых пользователей

**Когда срабатывает**: Первые 5 сообщений от пользователя

**Алгоритм**:
```
1. Счетчик сообщений user.messageCount++
2. Если messageCount > 5 → пропуск проверки
3. Базовые фильтры:
   - Длина > 1000 символов
   - Повторяющиеся символы aaaaaaa
   - Более 2 ссылок
   - Спам-слова ("заработок", "деньги быстро" и др.)
4. Если базовый фильтр срабатывает → удаление + предупреждение
5. Если нет → отправка в AI для глубокой проверки
6. AI анализирует через промпт → "СПАМ" или "НЕ СПАМ"
7. Если AI определяет спам → удаление + предупреждение
```

**Список спам-слов**:
```typescript
[
  "заработок",
  "деньги быстро",
  "без вложений",
  "пирамида",
  "купить дешево",
  "акция",
  "скидка",
  "бесплатно",
  "выиграй"
]
```

### 3. 🤖 AI Чат (AIChatService)
**Цель**: Общение с пользователями через Gemini API

**Когда срабатывает**:
- Упоминание бота `@botusername`
- Ключевые фразы: "эй бот", "альтрон", "бот,"
- Ответ (reply) на сообщение бота

**Алгоритм**:
```
1. Проверка обращения → isBotMention()
2. Проверка дневного лимита (1500 запросов)
3. Проверка размера очереди (макс 8 сообщений)
4. Подготовка контекстного сообщения
5. Добавление в очередь MessageQueue
6. Обработка через processQueuedMessage():
   - Throttling 3 секунды между запросами
   - Typing индикатор
   - Запрос к Gemini API
   - Retry до 3 попыток
7. Отправка ответа в чат
8. Обновление контекста (история до 20 сообщений)
```

**Формат сообщения для AI**:
```
[2025-06-05 20:30][@username][First Name] пользователь спрашивает тебя: {message}
```

## 🔄 Жизненный цикл обработки событий

### События от Telegram

#### `chat_member`
```typescript
// Изменение статуса участника
oldMember.status === "left" && newMember.status === "member"
→ инициация капчи
```

#### `new_chat_members`
```typescript
// Новые участники (групповое добавление)
→ удаление системного сообщения
→ инициация капчи для каждого пользователя (кроме ботов)
```

#### `left_chat_member`
```typescript
// Пользователь покинул чат
→ удаление из ограниченных пользователей
→ удаление сообщения с капчей
→ очистка данных из репозитория
```

#### `message`
```typescript
// Обработка сообщения
→ getUserOrCreate()
→ проверка ограничений
→ антиспам проверка (первые 5 сообщений)
→ проверка обращения к боту
→ увеличение счетчика сообщений
```

#### `callback_query`
```typescript
// Ответ на капчу
→ validateAnswer()
→ обработка результата (success/failed)
→ удаление сообщения с капчей
→ снятие/усиление ограничений
```

## 🎮 Управление правами пользователей

### Ограничение (restrictUser)
```typescript
{
  can_send_messages: false,
  can_send_audios: false,
  can_send_documents: false,
  can_send_photos: false,
  can_send_videos: false,
  can_send_video_notes: false,
  can_send_voice_notes: false,
  can_send_polls: false,
  can_send_other_messages: false,
  can_add_web_page_previews: false,
  can_change_info: false,
  can_invite_users: false,
  can_pin_messages: false
}
```

### Снятие ограничений (unrestrictUser)
```typescript
{
  can_send_messages: true,
  can_send_audios: true,
  can_send_documents: true,
  can_send_photos: true,
  can_send_videos: true,
  can_send_video_notes: true,
  can_send_voice_notes: true,
  can_send_polls: true,
  can_send_other_messages: true,
  can_add_web_page_previews: true,
  can_change_info: false,      // остается false
  can_invite_users: true,
  can_pin_messages: false      // остается false
}
```

### Бан (banUser)
```typescript
await bot.api.banChatMember({
  chat_id: chatId,
  user_id: userId,
  until_date: Math.floor(Date.now() / 1000) + (60 * 60) // 1 час
})
```

## 📊 Структуры данных

### RestrictedUser (Капча)
```typescript
{
  userId: number          // ID пользователя Telegram
  chatId: number          // ID чата
  questionId: number      // ID сообщения с капчей (для удаления)
  answer: number          // Правильный ответ
  username?: string       // @username (может отсутствовать)
  firstname: string       // Имя пользователя
  timestamp: number       // Время создания капчи
  isAnswered: boolean     // Флаг ответа
}
```

### UserSpamCheck (Антиспам)
```typescript
{
  userId: number // ID пользователя
  messageCount: number // Количество проверенных сообщений (макс 5)
  isChecking: boolean // Флаг активной AI проверки
  lastCheckTime: number // Время последней проверки
}
```

### ChatContext (AI Чат)
```typescript
{
  chatId: string                // ID чата как строка
  messages: ChatMessage[]       // История сообщений (макс 20)
  lastActivity: number          // Время последней активности
  requestCount: number          // Общий счетчик запросов
  dailyRequestCount: number     // Дневной счетчик (лимит 1500)
  lastDailyReset: number       // Время последнего сброса счетчика
}
```

### MessageQueue (AI Очередь)
```typescript
{
  id: number // Уникальный ID сообщения
  message: string // Подготовленное сообщение для AI
  contextId: string // ID чата
  timestamp: number // Время добавления в очередь
  retryCount: number // Количество попыток (макс 3)
}
```

## 🔧 Конфигурационные константы

```typescript
// Капча
CAPTCHA_TIMEOUT = 60000 // 60 секунд на решение
CAPTCHA_NUMBERS_RANGE = [1, 10] // Диапазон чисел для примеров
CAPTCHA_OPTIONS_COUNT = 4 // Количество вариантов ответа

// Антиспам
MAX_MESSAGES_TO_CHECK = 5 // Проверяем первые 5 сообщений
MAX_MESSAGE_LENGTH = 1000 // Максимальная длина сообщения
MAX_URLS_COUNT = 2 // Максимум ссылок в сообщении
REPEAT_PATTERN = /(.)\1{5,}/ // Повторяющиеся символы

// AI Чат
DAILY_LIMIT = 1500 // Дневной лимит запросов на чат
MAX_QUEUE_SIZE = 8 // Максимальный размер очереди
THROTTLE_DELAY = 3000 // 3 секунды между AI запросами
MAX_CONTEXT_MESSAGES = 20 // Максимум сообщений в контексте
MAX_RETRY_COUNT = 3 // Максимум попыток повтора
CONTEXT_CLEANUP_AGE = 86400000 // 24 часа до очистки контекста

// Бан
BAN_DURATION = 3600 // 1 час бана в секундах
```

## 🎯 Регулярные выражения

### Распознавание обращений к боту
```typescript
const botTriggers = [
  /^эй.{0,3}бот\W?/i, // "эй бот", "эйй бот", "эй, бот"
  /^альтрон/gi, // "альтрон" (имя бота)
  /^бот[,\s]/i // "бот," или "бот "
]
```

### Антиспам проверки
```typescript
// Повторяющиеся символы (более 5 подряд)
/(.)\1{5,}/

// Поиск URL в сообщении
/https?:\/\/[^\s]+/g
```

## 📝 Примеры сообщений

### Капча
```
@username, добро пожаловать! 🎉

Для получения доступа к чату решите простой пример:

5 + 3 = ?

[6] [8] [9] [11]
```

### Антиспам предупреждение
```
Хмм... 🧐
Сообщение от [John Doe, @john] похоже на спам.

Сообщение удалено.
Причина: Too many URLs

@admin_username
```

### Капча - успех
```
✅ John, добро пожаловать в чат! Капча решена правильно.
```

### Капча - ошибка
```
❌ John, неправильный ответ. Вы временно заблокированы.
```

### Капча - таймаут
```
⏰ John, время на решение капчи истекло. Вы временно заблокированы.
```

### AI лимит превышен
```
Превышен дневной лимит запросов (1500). Попробуйте завтра.
```

### AI очередь полная
```
Слишком много сообщений в очереди. Попробуйте позже.
```

---

*Справочник обновлен: 05.06.2025*
*Версия: 2.0*
