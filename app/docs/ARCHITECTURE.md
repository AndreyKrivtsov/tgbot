# 🏗️ Архитектура Telegram Bot "Альтрон"

## 📋 Обзор

Проект построен на современной модульной архитектуре с использованием принципов:
- **Dependency Injection** - управление зависимостями
- **Single Responsibility** - каждый компонент имеет одну ответственность
- **Event-Driven Architecture** - слабая связанность через события
- **Graceful Lifecycle** - корректное управление жизненным циклом

## 🎯 Архитектурные слои

### 1. Core Layer (src/core/)

Базовые архитектурные компоненты:

```typescript
// Container.ts - DI контейнер
export class Container {
  register<T>(name: string, factory: () => Promise<T>): void
  getAsync<T>(name: string): Promise<T>
  initialize(): Promise<void>
  start(): Promise<void>
  stop(): Promise<void>
  dispose(): Promise<void>
}

// Application.ts - оркестратор приложения
export class Application {
  async initialize(): Promise<void> // Регистрация сервисов
  async start(): Promise<void> // Запуск приложения
  async stop(): Promise<void> // Остановка приложения
}

// EventBus.ts - система событий
export class EventBus {
  emit<T>(event: string, data: T): void
  on<T>(event: string, handler: (data: T) => void): void
  off(event: string, handler: Function): void
}
```

### 2. Services Layer (src/services/)

Бизнес-сервисы, каждый реализует интерфейс `IService`:

```typescript
interface IService {
  name: string
  initialize: () => Promise<void> // Инициализация ресурсов
  start: () => Promise<void> // Запуск сервиса
  stop: () => Promise<void> // Остановка сервиса
  dispose: () => Promise<void> // Очистка ресурсов
  isHealthy: () => boolean // Проверка состояния
}
```

#### Основные сервисы:

- **TelegramBotService** - модульная система бота
- **AIChatServiceRefactored** - рефакторированный AI сервис
- **DatabaseService** - работа с PostgreSQL
- **RedisService** - кеширование
- **CaptchaService** - система капчи
- **AntiSpamService** - защита от спама
- **ApiServerService** - веб API сервер
- **ChatSettingsService** - управление настройками чатов
- **WeatherService** - прогноз погоды (опциональный)
- **EventBus** - система событий для слабой связности

### 3. Repository Layer (src/repository/)

Слой доступа к данным с использованием Drizzle ORM:

```typescript
// ChatRepository.ts
export class ChatRepository {
  async createChat(chatData: CreateChatData): Promise<Chat>
  async getChatById(chatId: number): Promise<Chat | null>
  async updateChatSettings(chatId: number, updates: Partial<ChatConfig>): Promise<void>
  async isChatActive(chatId: number): Promise<boolean>
}
```

## 🔧 TelegramBot Service - Модульная архитектура

Telegram бот построен по модульному принципу:

```
TelegramBot/
├── index.ts              # Главный класс TelegramBotService
├── core/
│   └── GramioBot.ts      # Обертка над GramIO
├── handlers/             # Обработчики событий
│   ├── MessageHandler.ts # Обработка сообщений
│   ├── CommandHandler.ts # Обработка команд
│   ├── MemberHandler.ts  # Обработка входа/выхода участников
│   ├── CallbackHandler.ts# Обработка callback кнопок
│   └── ModerationEventHandler.ts # Обработка событий модерации
├── features/             # Функциональные модули
│   ├── CaptchaManager.ts # Управление капчей
│   ├── SpamDetector.ts   # Детекция спама
│   └── UserManager.ts    # Управление пользователями
├── utils/                # Утилиты
│   ├── SettingsManager.ts# Управление настройками
│   ├── UserRestrictions.ts# Система ограничений
│   ├── MessageFormatter.ts# Форматирование сообщений
│   └── Messages.ts       # Шаблоны сообщений
└── types/
    └── index.ts          # TypeScript типы
```

### Принципы модульности:

1. **Разделение ответственности** - каждый модуль отвечает за свою область
2. **Слабая связанность** - модули взаимодействуют через интерфейсы
3. **Расширяемость** - легко добавлять новые модули
4. **Тестируемость** - каждый модуль можно тестировать изолированно

## 🧠 AIChatService - Рефакторированная архитектура

AI сервис разделен на специализированные компоненты:

```
AIChatService/
├── AIChatServiceRefactored.ts # Главный оркестратор
├── providers/
│   ├── IAIProvider.ts         # Интерфейс AI провайдера
│   └── GeminiAdapter.ts       # Адаптер для Google Gemini
├── ChatConfigService.ts       # Управление настройками чатов
├── MessageProcessor.ts        # Обработка и валидация сообщений
├── AIResponseService.ts       # Генерация ответов AI
├── TypingManager.ts          # Управление индикаторами печати
├── ChatContextManager.ts     # Управление контекстами
├── ChatQueueManager.ts       # Управление очередями
├── AdaptiveThrottleManager.ts# Адаптивное троттлинг
├── ModerationTools.ts        # Инструменты модерации
└── interfaces.ts             # TypeScript интерфейсы
```

### Компоненты и их роли:

1. **AIChatServiceRefactored** - главный оркестратор, координирует работу всех компонентов
2. **ChatConfigService** - управление настройками чатов, API ключами
3. **MessageProcessor** - валидация, очистка упоминаний, подготовка сообщений
4. **AIResponseService** - взаимодействие с AI провайдером, генерация ответов
5. **TypingManager** - управление индикаторами "печатает"
6. **ChatContextManager** - управление контекстами диалогов с кешированием
7. **ChatQueueManager** - управление очередями сообщений
8. **AdaptiveThrottleManager** - адаптивное ограничение скорости запросов
9. **ModerationTools** - инструменты автоматической модерации

## 🎪 Event-Driven Architecture

Система событий обеспечивает слабую связанность компонентов:

```typescript
// Типы событий (src/types/events.ts)
export interface ModerationEvent {
  type: "delete_message" | "mute_user" | "ban_user" | "unban_user"
  chatId: number
  userId?: number
  messageId?: number
  duration?: number
  reason?: string
}

// Использование
eventBus.emit<ModerationEvent>("moderation:action", {
  type: "delete_message",
  chatId: -1001234567890,
  messageId: 12345,
  reason: "Spam content"
})
```

### События в системе:

- **moderation:action** - действия модерации
- **user:joined** - вход пользователя
- **user:left** - выход пользователя
- **message:spam** - обнаружен спам
- **captcha:solved** - капча решена
- **ai:response** - ответ AI готов

## 💾 Data Layer

### Database Schema (PostgreSQL + Drizzle ORM)

```sql
-- Основные таблицы
chats (
  id BIGINT PRIMARY KEY,
  type VARCHAR NOT NULL,
  title VARCHAR,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
)

chat_configs (
  chat_id BIGINT PRIMARY KEY REFERENCES chats(id),
  ai_enabled BOOLEAN DEFAULT false,
  ai_api_key_hash VARCHAR,
  system_prompt TEXT,
  daily_limit INTEGER DEFAULT 100,
  captcha_enabled BOOLEAN DEFAULT true,
  antispam_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
)

group_admins (
  chat_id BIGINT REFERENCES chats(id),
  user_id BIGINT NOT NULL,
  added_by BIGINT,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (chat_id, user_id)
)
```

### Кеширование (Redis)

- **Контексты AI** - `ai_context:{chatId}` (TTL: 24h)
- **Настройки чатов** - `chat_config:{chatId}` (TTL: 10m)
- **Информация о пользователях** - `user:{userId}` (TTL: 5m)
- **Счетчики сообщений** - `user_messages:{chatId}:{userId}` (TTL: 1h)

## 🔄 Жизненный цикл приложения

```mermaid
graph TD
    A[App Start] --> B[Container.initialize]
    B --> C[Register Services]
    C --> D[Container.start]
    D --> E[Service.initialize]
    E --> F[Service.start]
    F --> G[Application Running]
    G --> H[Graceful Shutdown Signal]
    H --> I[Container.stop]
    I --> J[Service.stop]
    J --> K[Container.dispose]
    K --> L[Service.dispose]
    L --> M[App Exit]
```

### Фазы жизненного цикла:

1. **Registration** - регистрация всех сервисов в Container
2. **Initialization** - создание экземпляров и инициализация ресурсов
3. **Start** - запуск всех сервисов
4. **Runtime** - основная работа приложения
5. **Stop** - корректная остановка сервисов
6. **Dispose** - освобождение всех ресурсов

## 🔗 Интеграции

### AI Providers

```typescript
interface IAIProvider {
  generateResponse: (request: AIRequest) => Promise<AIResponse>
  isHealthy: () => boolean
}

// GeminiAdapter.ts
export class GeminiAdapter implements IAIProvider {
  async generateResponse(request: AIRequest): Promise<AIResponse> {
    // Интеграция с Google Gemini API
  }
}
```

### External Services

- **AntiSpam API** - анализ сообщений на спам
- **LLAMA API** - дополнительная AI функциональность
- **Captcha Service** - генерация математических капч
- **Weather API** - прогноз погоды (дополнительная функция)

## 🧪 Testing Architecture

```
__tests__/
├── unit/                 # Unit тесты
│   ├── core/            # Тесты архитектурных компонентов
│   └── services/        # Тесты сервисов
├── integration/         # Integration тесты
│   ├── AntiSpamFlow.test.js
│   ├── CaptchaFlow.test.js
│   └── GeminiAIFlow.test.js
├── setup.ts            # Настройка тестовой среды
└── README.md          # Документация тестов
```

### Принципы тестирования:

- **Unit тесты** - изолированное тестирование каждого компонента
- **Integration тесты** - тестирование взаимодействия компонентов
- **Mocking** - мокирование внешних зависимостей
- **Coverage** - контроль покрытия кода тестами

## 🚀 Scalability & Performance

### Адаптивное троттлинг

```typescript
// AdaptiveThrottleManager.ts
export class AdaptiveChatThrottleManager {
  // Token Bucket алгоритм с адаптивными параметрами
  // Автоматическая настройка задержек на основе длины ответов
  // Cleanup неактивных чатов
}
```

### Кеширование

- **Multi-level caching** - Redis + in-memory кеш
- **TTL-based invalidation** - автоматическое истечение кеша
- **Intelligent prefetching** - предзагрузка данных

### Queue Management

- **Per-chat queues** - отдельные очереди для каждого чата
- **Backpressure handling** - обработка перегрузок
- **Retry mechanisms** - повторные попытки при ошибках

## 🔒 Security

- **Input validation** - валидация всех входных данных
- **SQL injection protection** - использование ORM (Drizzle)
- **API key management** - безопасное хранение ключей
- **Rate limiting** - ограничение скорости запросов
- **Graceful error handling** - безопасная обработка ошибок

## 📊 Monitoring & Observability

- **Structured logging** - структурированные логи с уровнями
- **Health checks** - проверка состояния всех сервисов
- **Metrics collection** - сбор метрик производительности
- **Error tracking** - отслеживание и анализ ошибок
