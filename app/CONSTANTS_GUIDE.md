# 🔧 Руководство по константам

Этот документ описывает централизованную систему констант в приложении.

## 📁 Структура

- `src/constants.ts` - Основной файл с константами
- `env.constants.example` - Пример переменных окружения
- Каждый сервис импортирует нужные константы

## 🚀 Использование

### Импорт констант

```typescript
import { AI_CHAT_CONFIG, BOT_CONFIG, WEATHER_CONFIG } from "../../constants.js"
```

### Использование в коде

```typescript
// Вместо магического числа
setTimeout(callback, 60000)

// Используем константу
setTimeout(callback, BOT_CONFIG.CAPTCHA_TIMEOUT_MS)
```

## 📋 Категории констант

### 🤖 BOT_CONFIG
Основные настройки Telegram бота:
- `CAPTCHA_TIMEOUT_MS` - Таймаут капчи (60 сек)
- `ERROR_MESSAGE_DELETE_TIMEOUT_MS` - Удаление ошибок (60 сек)
- `TEMPORARY_BAN_DURATION_SEC` - Временный бан (40 сек)
- `MAX_MESSAGES_FOR_SPAM_CHECK` - Лимит сообщений для спама (5)

### 🧠 AI_CHAT_CONFIG
Настройки AI чата:
- `THROTTLE_DELAY_MS` - Задержка между запросами (3 сек)
- `MAX_QUEUE_SIZE` - Размер очереди (8)

### 🛡️ ANTI_SPAM_CONFIG
Антиспам настройки:
- `TIMEOUT_MS` - Таймаут запроса (5 сек)
- `MAX_RETRIES` - Количество попыток (2)
- `RETRY_DELAY_MS` - Задержка между попытками (1 сек)

### 🌦️ WEATHER_CONFIG
Настройки погодного сервиса:
- `DEFAULT_LATITUDE/LONGITUDE` - Координаты (настраиваемые через env)
- `UPDATE_INTERVAL_MS` - Интервал обновления (30 сек)
- `FORECAST_HOURS` - Часы отправки прогноза [9,13,17,21]
- `CANVAS_WIDTH/HEIGHT` - Размеры изображения (400x400)
- `TEXT_POSITIONS` - Позиции текста на изображении

### 🌐 HTTP_CONFIG
HTTP и сетевые настройки:
- `SUCCESS_STATUS` - HTTP OK статус (200)
- `UNIX_TIMESTAMP_DIVIDER` - Делитель для Unix времени (1000)

## 🔧 Переменные окружения

Некоторые константы можно переопределить через переменные окружения:

```bash
# Погода
WEATHER_LATITUDE=12.2741076
WEATHER_LONGITUDE=109.2006335
WEATHER_TIMEZONE_OFFSET=7
WEATHER_FORECAST_HOURS=9,13,17,21

# AI
AI_THROTTLE_DELAY_MS=3000

# Антиспам
ANTISPAM_TIMEOUT_MS=5000
ANTISPAM_MAX_RETRIES=2
```

## ✅ Преимущества

1. **Централизация** - Все магические числа в одном месте
2. **Типизация** - TypeScript типы для всех константы
3. **Настраиваемость** - Переопределение через env переменные
4. **Читаемость** - Понятные имена вместо чисел
5. **Поддержка** - Легко изменить значения

## 🔄 Миграция

### Было:
```typescript
setTimeout(callback, 60000) // 60 секунд
if (retries < 2) // 2 попытки
  canvas.width = 400 // ширина
```

### Стало:
```typescript
setTimeout(callback, BOT_CONFIG.CAPTCHA_TIMEOUT_MS)
if (retries < ANTI_SPAM_CONFIG.MAX_RETRIES)
  canvas.width = WEATHER_CONFIG.CANVAS_WIDTH
```

## ⚠️ Исправленные проблемы

1. **Дублирование** - `errorMessageDeleteTimeoutMs` было 20000 и 60000
2. **Хардкод координат** - Координаты погоды теперь настраиваемые
3. **Разбросанные числа** - Позиции текста в WeatherService централизованы

## 📝 Рекомендации

1. **Всегда используйте константы** вместо магических чисел
2. **Группируйте** связанные константы в отдельные объекты
3. **Документируйте** назначение каждой константы
4. **Используйте env переменные** для настройки окружения
5. **Валидируйте** значения при необходимости
