# 🏗️ Архитектура Telegram Бота

## 📋 Содержание
- [Общий обзор](#общий-обзор)
- [Архитектурные принципы](#архитектурные-принципы)
- [Основные компоненты](#основные-компоненты)
- [Сервисы бота](#сервисы-бота)
- [Логика работы бота](#логика-работы-бота)
- [API и веб-интерфейс](#api-и-веб-интерфейс)
- [Конфигурация](#конфигурация)
- [Разработка и расширение](#разработка-и-расширение)

---

## 🎯 Общий обзор

Это современная, модульная архитектура Telegram бота с тремя основными функциями:
1. **🔐 Капча** - проверка новых пользователей математическими задачами
2. **🛡️ Антиспам** - фильтрация первых сообщений через AI
3. **🤖 AI Чат** - общение с пользователями через Gemini API

### Технологический стек
- **Язык**: TypeScript
- **Платформа**: Node.js
- **Telegram API**: GramIO
- **AI**: Google Gemini 2.5
- **Веб-сервер**: Fastify
- **База данных**: PostgreSQL (планируется)
- **Архитектура**: Dependency Injection + Service-oriented

---

## 🏛️ Архитектурные принципы

### 1. **Dependency Injection (DI)**
```typescript
// Все зависимости инжектируются через конструктор
class TelegramBotService {
  constructor(
    private config: AppConfig,
    private logger: Logger,
    private dependencies: {
      captchaService?: CaptchaService
      antiSpamService?: AntiSpamService
      aiChatService?: AIChatService
    }
  ) {}
}
```

### 2. **Service Lifecycle Management**
Каждый сервис реализует интерфейс `IService`:
```typescript
interface IService {
  initialize?(): Promise<void>  // Инициализация ресурсов
  start?(): Promise<void>       // Запуск сервиса
  stop?(): Promise<void>        // Остановка сервиса
  dispose?(): Promise<void>     // Освобождение ресурсов
}
```

### 3. **Разделение ответственности**
- **Каждый сервис** отвечает за одну функцию
- **Container** управляет зависимостями и жизненным циклом
- **Application** оркестрирует регистрацию сервисов
- **App** управляет запуском/остановкой приложения

### 4. **Асинхронность и очереди**
- Все операции неблокирующие
- AI запросы обрабатываются через очередь
- Throttling и rate limiting

---

## 📦 Основные компоненты

### 📁 Структура проекта
```
app/src/
├── core/                    # Архитектурные компоненты
│   ├── Container.ts         # DI контейнер
│   └── Application.ts       # Оркестратор сервисов
├── services/                # Бизнес-сервисы
│   ├── TelegramBotService.ts    # Главный сервис бота
│   ├── CaptchaService.ts        # Сервис капчи
│   ├── AntiSpamService.ts       # Сервис антиспама
│   ├── AIChatService.ts         # Сервис AI чата
│   ├── DatabaseService.ts       # Сервис БД
│   ├── CacheService.ts          # Сервис кэша
│   ├── AIService.ts             # Сервис AI API
│   └── WebServerService.ts      # Веб-сервер
├── bot/                     # Старая логика бота (референс)
├── helpers/                 # Утилиты
├── repository/              # Слой данных
├── web/                     # Веб-интерфейс
├── app.ts                   # Главный класс приложения
├── index.ts                 # Точка входа
└── config.ts                # Конфигурация
```

### 🔧 Container (DI контейнер)
**Файл**: `app/src/core/Container.ts`

**Назначение**: Управление зависимостями и жизненным циклом сервисов

**Ключевые методы**:
```typescript
// Регистрация сервиса или фабрики
container.register("serviceName", serviceInstance | factory)

// Получение сервиса (синхронно)
const service = container.get<ServiceType>("serviceName")

// Получение сервиса (асинхронно)
const service = await container.getAsync<ServiceType>("serviceName")

// Жизненный цикл
await container.initialize() // Создание всех экземпляров + initialize()
await container.start()      // Запуск всех сервисов (start())
await container.stop()       // Остановка всех сервисов (stop())
await container.dispose()    // Освобождение ресурсов (dispose())
```

### 🎯 Application (Оркестратор)
**Файл**: `app/src/core/Application.ts`

**Назначение**: Регистрация всех сервисов в правильном порядке

**Порядок регистрации**:
1. **Core services**: Repository, Database, Cache
2. **Infrastructure services**: AI Service
3. **Business services**: Captcha, AntiSpam, AI Chat
4. **Web services**: Telegram Bot, Web Server

---

## 🤖 Сервисы бота

### 1. 🔐 CaptchaService
**Файл**: `app/src/services/CaptchaService.ts`

**Назначение**: Проверка новых пользователей математическими задачами

**Логика работы**:
```typescript
interface CaptchaChallenge {
  question: number[]  // [5, 3] для "5 + 3 = ?"
  answer: number      // 8
  options: number[]   // [6, 8, 9, 11] - 4 варианта ответа
}

interface RestrictedUser {
  userId: number
  chatId: number
  questionId: number      // ID сообщения с капчей
  answer: number          // Правильный ответ
  username?: string
  firstname: string
  timestamp: number       // Время создания капчи
  isAnswered: boolean     // Флаг ответа
}
```

**Ключевые методы**:
- `generateCaptcha()` - генерация математической задачи
- `addRestrictedUser()` - добавление пользователя в ограниченные
- `validateAnswer()` - проверка ответа пользователя
- `startTimeoutMonitoring()` - мониторинг таймаутов (60 секунд)

**Колбэки для TelegramBotService**:
- `onCaptchaTimeout` - таймаут капчи
- `onCaptchaSuccess` - правильный ответ
- `onCaptchaFailed` - неправильный ответ

### 2. 🛡️ AntiSpamService
**Файл**: `app/src/services/AntiSpamService.ts`

**Назначение**: Фильтрация спам-сообщений в первых 5 сообщениях пользователя

**Логика работы**:
```typescript
interface UserSpamCheck {
  userId: number
  messageCount: number    // Счетчик сообщений (макс 5)
  isChecking: boolean     // Флаг активной AI проверки
  lastCheckTime: number   // Время последней проверки
}
```

**Алгоритм проверки**:
1. **Счетчик сообщений**: Проверяем только первые 5 сообщений
2. **Базовые фильтры**:
   - Длина сообщения > 1000 символов
   - Повторяющиеся символы (более 5 подряд)
   - Более 2 ссылок
   - Спам-слова: "заработок", "деньги быстро", "без вложений" и т.д.
3. **AI проверка**: Отправка в Gemini с промптом для анализа

**Ключевые методы**:
- `checkMessage()` - основная проверка сообщения
- `performBasicChecks()` - базовые фильтры
- `checkWithAI()` - проверка через AI
- `cleanupOldRecords()` - очистка старых записей

### 3. 🤖 AIChatService
**Файл**: `app/src/services/AIChatService.ts`

**Назначение**: Обработка обращений к боту и общение через Gemini API

**Логика работы**:
```typescript
interface ChatContext {
  chatId: string
  messages: ChatMessage[]     // История сообщений (макс 20)
  lastActivity: number
  requestCount: number        // Общий счетчик запросов
  dailyRequestCount: number   // Дневной счетчик (лимит 1500)
  lastDailyReset: number     // Время последнего сброса
}

interface MessageQueue {
  id: number
  message: string
  contextId: string
  timestamp: number
  retryCount: number         // Попытки повтора (макс 3)
}
```

**Распознавание обращений**:
- `@botusername` - прямое упоминание
- `"эй бот"`, `"альтрон"` - ключевые фразы
- Reply на сообщение бота

**Обработка запросов**:
1. **Проверка лимитов**: 1500 запросов в день на чат
2. **Очередь**: Максимум 8 сообщений в очереди
3. **Throttling**: 3 секунды между запросами к AI
4. **Контекст**: Сохранение истории диалога (20 сообщений)
5. **Retry**: До 3 попыток при ошибках

**Ключевые методы**:
- `isBotMention()` - проверка обращения к боту
- `processMessage()` - добавление в очередь
- `startQueueProcessor()` - обработчик очереди
- `throttledAIRequest()` - запрос к AI с ограничениями

**Колбэки для TelegramBotService**:
- `onMessageResponse` - отправка ответа
- `onTypingStart/Stop` - индикатор набора текста

### 4. 📱 TelegramBotService
**Файл**: `app/src/services/TelegramBotService.ts`

**Назначение**: Главный сервис, объединяющий всю логику бота

**Обработчики событий**:
```typescript
// Новые участники
bot.on("chat_member", handleChatMember)
bot.on("new_chat_members", handleNewChatMembers)
bot.on("left_chat_member", handleLeftChatMember)

// Сообщения и колбэки
bot.on("message", handleMessage)
bot.on("callback_query", handleCallbackQuery)
```

**Интеграция сервисов**:
- **CaptchaService**: Обработка капчи для новых пользователей
- **AntiSpamService**: Проверка первых сообщений
- **AIChatService**: Обработка AI чата

---

## 🔄 Логика работы бота

### Сценарий 1: Новый пользователь присоединяется к чату

**Подробный алгоритм**:

1. **Событие**: `chat_member` с переходом `left -> member`
2. **Генерация капчи**:
   ```typescript
   const question = [randomNumber(1,10), randomNumber(1,10)]
   const answer = question[0] + question[1]
   const options = [wrongAnswer1, wrongAnswer2, wrongAnswer3, answer] // перемешаны
   ```
3. **Отправка сообщения**:
   ```
   "@username, добро пожаловать! 🎉
   
   Для получения доступа к чату решите простой пример:
   
   5 + 3 = ?
   
   [6] [8] [9] [11]  // InlineKeyboard
   ```
4. **Ограничение прав**:
   ```typescript
   restrictChatMember({
     can_send_messages: false,
     can_send_audios: false,
     // ... все права false
   })
   ```
5. **Мониторинг**: Через 60 секунд автоматический бан если нет ответа

### Сценарий 2: Пользователь отправляет сообщение

**Антиспам проверка**:
1. **Базовые фильтры**:
   - Длина > 1000 символов → спам
   - Повторяющиеся символы: `/(.)\1{5,}/` → спам
   - Более 2 ссылок → спам
   - Спам-слова из списка → спам

2. **AI проверка**:
   ```typescript
   const prompt = `Проанализируй это сообщение и определи, является ли оно спамом. 
   Отвечай только "СПАМ" или "НЕ СПАМ":
   
   Сообщение: "${message}"
   
   Критерии спама:
   - Реклама товаров/услуг
   - Призывы к переходам по ссылкам
   - Предложения заработка
   - Навязчивая реклама
   - Мошенничество
   - Повторяющийся контент`
   ```

**AI чат проверка**:
- `@botusername` в тексте
- Ответ на сообщение бота (reply)
- Регексы: `/^эй.{0,3}бот\W?/i`, `/^альтрон/gi`, `/^бот[,\s]/i`

### Сценарий 3: AI чат обработка

**Подготовка сообщения для AI**:
```typescript
const prepareContextualMessage = (message, username, firstName) => {
  const date = new Date().toISOString().replace(/:\d+\.\d+Z/gi, "").replace("T", " ")
  const userInfo = firstName ? 
    (username ? `@${username}][${firstName}` : `${firstName}`) :
    (username ? `@${username}` : "пользователь")
  
  return `[${date}][${userInfo}] пользователь спрашивает тебя: ${message}`
}
// Результат: "[2025-06-05 20:30][[@john][John Doe] пользователь спрашивает тебя: Привет, как дела?"
```

**Управление очередью**:
- Максимум 8 сообщений в очереди
- Обработка по одному с интервалом 1 секунда
- Throttling: 3 секунды между AI запросами
- Retry: до 3 попыток при ошибках

**Управление контекстом**:
- История до 20 сообщений на чат
- Автоочистка через 24 часа неактивности
- Дневной лимит: 1500 запросов (сброс в 00:00)

---

## 🌐 API и веб-интерфейс

### WebServerService
**Файл**: `app/src/services/WebServerService.ts`

**Endpoints**:
```typescript
GET  /api/health           // Статус приложения
GET  /api/config           // Конфигурация бота (только для создателя)
POST /api/config           // Обновление конфигурации
GET  /api/stats            // Статистика сервисов
GET  /admin                // Telegram WebApp интерфейс
```

### Telegram WebApp
**URL**: `https://your-domain.com/admin`

**Функции**:
- 🔐 Настройки капчи (вкл/выкл, таймаут)
- 🛡️ Настройки антиспама (количество проверяемых сообщений)
- 🤖 Настройки AI чата (дневной лимит, вкл/выкл)
- 📊 Статистика по всем сервисам

**Безопасность**: Доступ только создателю бота (проверка через Telegram initData)

---

## ⚙️ Конфигурация

### Файл конфигурации
**Файл**: `app/src/config.ts`

```typescript
export const config = {
  // Основные настройки
  NODE_ENV: process.env.NODE_ENV || "development",
  BOT_TOKEN: process.env.BOT_TOKEN!,
  
  // Веб-сервер
  WEB_PORT: parseInt(process.env.WEB_PORT || "3000"),
  WEB_HOST: process.env.WEB_HOST || "0.0.0.0",
  
  // База данных
  DATABASE_URL: process.env.DATABASE_URL || "postgresql://...",
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  
  // AI API
  AI_API_KEY: process.env.AI_API_KEY || "",
  AI_API_THROTTLE: parseInt(process.env.AI_API_THROTTLE || "3000"),
  
  // Чат по умолчанию
  DEFAULT_CHAT_ID: parseInt(process.env.DEFAULT_CHAT_ID || "0"),
  
  // Админ
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || "",
}
```

### Переменные окружения (.env)
```bash
# Основные
NODE_ENV=development
BOT_TOKEN=your_telegram_bot_token

# Веб-сервер
WEB_PORT=3000
WEB_HOST=0.0.0.0

# AI
AI_API_KEY=your_gemini_api_key
AI_API_THROTTLE=3000

# База данных
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://localhost:6379

# Настройки бота
DEFAULT_CHAT_ID=-1001234567890
ADMIN_USERNAME=@admin_username
```

---

## 🛠️ Разработка и расширение

### Добавление нового сервиса

1. **Создать класс сервиса**:
```typescript
// app/src/services/NewService.ts
import type { IService } from "../core/Container.js"

export class NewService implements IService {
  async initialize(): Promise<void> {
    // Инициализация
  }

  async start(): Promise<void> {
    // Запуск
  }

  async stop(): Promise<void> {
    // Остановка
  }

  async dispose(): Promise<void> {
    // Освобождение ресурсов
  }
}
```

2. **Зарегистрировать в Application**:
```typescript
// app/src/core/Application.ts
this.container.register("newService", async () => {
  const { NewService } = await import("../services/NewService.js")
  return new NewService(this.config, this.logger)
})
```

3. **Использовать в других сервисах**:
```typescript
// Зависимость
const newService = await this.container.getAsync("newService")
```

### Расширение логики бота

**Добавление нового обработчика событий**:
```typescript
// В TelegramBotService.setupEventHandlers()
this.bot.on("new_event", (context) => {
  this.handleNewEvent(context)
})

private async handleNewEvent(context: any): Promise<void> {
  // Ваша логика
}
```

**Добавление новой команды**:
```typescript
// В TelegramBotService.setupEventHandlers()
this.bot.command("newcommand", (context) => {
  this.handleNewCommand(context)
})
```

### Отладка и мониторинг

**Логирование**:
```typescript
this.logger.d("Debug message")     // DEBUG
this.logger.i("Info message")      // INFO  
this.logger.w("Warning message")   // WARN
this.logger.e("Error message")     // ERROR
```

**Статистика сервисов**:
```typescript
// Каждый сервис предоставляет статистику
const stats = service.getStats()

// Пример ответа CaptchaService:
{
  restrictedUsers: 5,
  isMonitoring: true,
  serviceStatus: "active"
}
```

**Health checks**:
```typescript
const isHealthy = service.isHealthy()
// true/false - состояние сервиса
```

### Тестирование

**Структура тестов**:
```typescript
// tests/services/CaptchaService.test.ts
describe("CaptchaService", () => {
  it("should generate valid captcha", () => {
    const captchaService = new CaptchaService(config, logger)
    const captcha = captchaService.generateCaptcha()
    
    expect(captcha.question).toHaveLength(2)
    expect(captcha.options).toHaveLength(4)
    expect(captcha.options).toContain(captcha.answer)
  })
})
```

### Развертывание

**Docker**:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
CMD ["npm", "start"]
```

**Docker Compose**:
```yaml
version: '3.8'
services:
  bot:
    build: .
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - AI_API_KEY=${AI_API_KEY}
    depends_on:
      - postgres
      - redis
  
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: botdb
      POSTGRES_USER: botuser
      POSTGRES_PASSWORD: botpass
  
  redis:
    image: redis:7-alpine
```

---

## 📊 Метрики и мониторинг

### Ключевые метрики
- **Капча**: Количество активных капч, процент успешных решений
- **Антиспам**: Количество проверенных сообщений, процент спама
- **AI чат**: Количество запросов в день, размер очереди, время ответа
- **Система**: Использование памяти, время работы, количество ошибок

### Логи приложения
```
[05.06.2025 20:24:43][App][INFO]: 🎉 Application is running!
[05.06.2025 20:24:45][App][INFO]: ✅ Telegram bot started: @test_ai_group_bot
[05.06.2025 20:24:45][App][INFO]: 🌍 Environment: development
[05.06.2025 20:24:45][App][INFO]: 🤖 Bot mode: enabled
```

---

## 🚀 Быстрый старт для разработчиков

### Установка и запуск
```bash
# 1. Клонирование и установка
git clone <repo>
cd tgbot/app
npm install

# 2. Настройка окружения
cp .env.example .env
# Заполнить BOT_TOKEN, AI_API_KEY

# 3. Сборка и запуск
npm run build
npm start
```

### Структура для понимания
1. **Начните с**: `app/src/index.ts` → `app.ts` → `core/Application.ts`
2. **Основная логика**: `services/TelegramBotService.ts`
3. **Функции бота**: `services/CaptchaService.ts`, `AntiSpamService.ts`, `AIChatService.ts`
4. **Конфигурация**: `config.ts` и `.env`

### Полезные команды
```bash
npm run build      # Сборка TypeScript
npm start          # Запуск приложения
npm run dev        # Разработка с watch mode
npm test           # Запуск тестов
npm run lint       # Линтинг кода
```

---

## 📈 Планы развития

### Краткосрочные задачи
- [ ] Интеграция с реальным Gemini API
- [ ] Подключение PostgreSQL для хранения контекстов
- [ ] Веб-интерфейс администратора
- [ ] Расширенная аналитика

### Долгосрочные планы  
- [ ] Мультигрупповая поддержка
- [ ] Дополнительные AI провайдеры
- [ ] Кастомизируемые правила антиспама
- [ ] Telegram Mini App интерфейс
- [ ] Интеграция с внешними системами

---

*Документация обновлена: 05.06.2025*  
*Версия архитектуры: 2.0*  
*Автор: AI Assistant + Development Team*