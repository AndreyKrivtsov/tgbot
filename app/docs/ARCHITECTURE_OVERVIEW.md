# 🏗️ Обзор архитектуры Telegram Bot

## 📋 Содержание

- [Общее описание](#общее-описание)
- [Технологический стек](#технологический-стек)
- [Архитектурные принципы](#архитектурные-принципы)
- [Структура проекта](#структура-проекта)
- [Система зависимостей](#система-зависимостей)
- [Жизненный цикл приложения](#жизненный-цикл-приложения)
- [Основные компоненты](#основные-компоненты)
- [Диаграмма взаимодействий](#диаграмма-взаимодействий)

## 🎯 Общее описание

Это современный Telegram-бот, построенный на основе модульной архитектуры с использованием принципов инверсии зависимостей (DI) и разделения ответственности. Бот предоставляет функции ИИ-чата, антиспама, капчи и управления групповыми чатами.

### Ключевые особенности:
- **Модульная архитектура** с четким разделением ответственности
- **Dependency Injection** для управления зависимостями
- **Graceful shutdown** с корректной остановкой всех сервисов
- **Типобезопасность** благодаря TypeScript
- **Тестируемость** благодаря DI и модульной структуре

## 🛠️ Технологический стек

### Основные технологии
- **TypeScript** - основной язык разработки
- **Node.js** - среда выполнения
- **GramIO** - библиотека для работы с Telegram Bot API
- **Drizzle ORM** - ORM для работы с базой данных
- **PostgreSQL** - основная база данных
- **Redis** - кеширование и временное хранение

### Дополнительные инструменты
- **Jest** - тестирование
- **ESLint** - линтинг кода
- **Fastify** - веб-сервер для API
- **env-var** - валидация переменных окружения
- **Axios** - HTTP клиент для внешних API

## 🏛️ Архитектурные принципы

### 1. Инверсия зависимостей (DI)
```typescript
// Сервис получает зависимости через конструктор
class TelegramBotService {
  constructor(
    config: AppConfig,
    logger: Logger,
    dependencies: {
      redisService: RedisService
      captchaService: CaptchaService
      antiSpamService: AntiSpamService
    },
    settings: BotSettings
  ) {
    // Инициализация
  }
}
```

### 2. Единая точка управления жизненным циклом
```typescript
// Container управляет всеми сервисами
await container.initialize() // Создание и инициализация
await container.start()      // Запуск
await container.stop()       // Остановка
await container.dispose()    // Очистка ресурсов
```

### 3. Четкое разделение слоев
- **Core** - базовые абстракции и контейнер DI
- **Services** - бизнес-логика и интеграции
- **Repository** - слой доступа к данным
- **Web** - веб-интерфейсы и API

## 📁 Структура проекта

```
app/src/
├── core/                  # Ядро приложения
│   ├── Application.ts     # Оркестратор сервисов
│   └── Container.ts       # DI контейнер
├── services/              # Бизнес-сервисы
│   ├── TelegramBot/       # Telegram бот
│   ├── AIChatService/     # ИИ чат
│   ├── AntiSpamService/   # Антиспам
│   ├── CaptchaService/    # Капча
│   ├── DatabaseService/   # База данных
│   ├── RedisService/      # Redis
│   └── ...
├── repository/            # Слой данных
│   └── ChatRepository.ts  # Репозиторий чатов
├── db/                    # Схема БД
│   ├── schema.ts          # Drizzle схема
│   └── index.ts           # Подключение к БД
├── helpers/               # Утилиты
│   └── Logger.ts          # Система логирования
├── web/                   # Веб-интерфейсы
└── __tests__/             # Тесты
```

## 🔗 Система зависимостей

### Container (DI контейнер)
Центральный компонент для управления зависимостями и жизненным циклом сервисов:

```typescript
export class Container {
  // Регистрация сервиса или фабрики
  register<T>(name: string, serviceOrFactory: T | ServiceFactory<T>)
  
  // Синхронное получение сервиса
  get<T>(name: string): T
  
  // Асинхронное получение сервиса
  async getAsync<T>(name: string): Promise<T>
  
  // Управление жизненным циклом
  async initialize(): Promise<void>
  async start(): Promise<void>
  async stop(): Promise<void>
  async dispose(): Promise<void>
}
```

### Регистрация сервисов
Сервисы регистрируются в `Application.ts` с помощью фабрик:

```typescript
// Регистрация через фабрику
this.container.register("database", async () => {
  const { DatabaseService } = await import("../services/DatabaseService/index.js")
  return new DatabaseService(this.config, this.logger)
})

// Регистрация с зависимостями
this.container.register("telegramBot", async () => {
  const redisService = await this.container.getAsync("redis")
  const captchaService = await this.container.getAsync("captcha")
  // ...
  return new TelegramBotService(config, logger, dependencies, settings)
})
```

## 🔄 Жизненный цикл приложения

### Последовательность запуска:
1. **Создание App** - создается главный класс приложения
2. **Инициализация Container** - создается DI контейнер
3. **Регистрация сервисов** - все сервисы регистрируются как фабрики
4. **Инициализация сервисов** - создаются экземпляры и вызывается `initialize()`
5. **Запуск сервисов** - вызывается `start()` для всех сервисов
6. **Работа** - приложение работает
7. **Graceful shutdown** - корректная остановка через `stop()` и `dispose()`

### Интерфейс сервиса:
```typescript
interface IService {
  initialize?(): Promise<void>  // Инициализация ресурсов
  start?(): Promise<void>       // Запуск сервиса
  stop?(): Promise<void>        // Остановка сервиса
  dispose?(): Promise<void>     // Освобождение ресурсов
}
```

## 🧩 Основные компоненты

### Core Services (Базовые)
- **DatabaseService** - подключение к PostgreSQL через Drizzle ORM
- **CacheService** - кеширование данных
- **RedisService** - работа с Redis

### Infrastructure Services (Инфраструктурные)
- **RedisService** - управление Redis подключением

### Business Services (Бизнес-логика)
- **ChatRepository** - работа с данными чатов
- **ChatConfigService** - управление конфигурацией чатов
- **CaptchaService** - система капчи для новых пользователей
- **AntiSpamService** - защита от спама
- **AIChatService** - ИИ чат с интеграцией LLM моделей

### Web Services (Веб-сервисы)
- **TelegramBotService** - основной Telegram бот
- **ApiServerService** - REST API (опционально)

## 🗄️ База данных

### Схема:
- **chats** - информация о чатах (ID, тип, название, активность)
- **chat_configs** - конфигурация ИИ для чатов (API ключи, промпты, настройки)
- **group_admins** - администраторы групп

### Основные особенности:
- Использование **Drizzle ORM** для типобезопасности
- **Индексы** для оптимизации запросов
- **JSON поля** для гибкого хранения конфигурации
- **Timestamp поля** для аудита

## 🔧 Конфигурация

Все настройки загружаются из переменных окружения с валидацией:

```typescript
export interface AppConfig {
  // Основные
  NODE_ENV: string
  BOT_TOKEN: string
  DATABASE_URL: string
  
  // Сервисы
  ANTISPAM_URL: string
  LLAMA_URL: string
  REDIS_URL?: string
  
  // Веб-сервер
  PORT: number
  
  // Логирование
  LOG_LEVEL: number
  LOG_USE_FILE: boolean
}
```

## 📊 Диаграмма взаимодействий

```
┌─────────────────┐
│   App (main)    │
└─────────┬───────┘
          │
    ┌─────▼─────┐
    │Application│
    └─────┬─────┘
          │
      ┌───▼───┐
      │Container│
      └───┬───┘
          │
  ┌───────┼───────┐
  │       │       │
┌─▼─┐   ┌─▼─┐   ┌─▼─┐
│DB │   │Bot│   │API│
└───┘   └─┬─┘   └───┘
          │
    ┌─────┼─────┐
    │     │     │
  ┌─▼─┐ ┌─▼──┐ ┌▼──┐
  │AI │ │Spam│ │Cap│
  └───┘ └────┘ └───┘
```

## 🚀 Особенности архитектуры

### Преимущества:
1. **Модульность** - легко добавлять новые сервисы
2. **Тестируемость** - моки зависимостей через DI
3. **Масштабируемость** - четкое разделение ответственности
4. **Типобезопасность** - полная поддержка TypeScript
5. **Graceful shutdown** - корректная остановка всех компонентов

### Паттерны:
- **Dependency Injection** - управление зависимостями
- **Service Locator** - получение сервисов по имени
- **Factory Pattern** - создание сервисов через фабрики
- **Repository Pattern** - абстракция доступа к данным
- **Service Layer** - разделение бизнес-логики

---

> 💡 **Следующие разделы**: [Диаграммы архитектуры](./ARCHITECTURE_DIAGRAM.md) | [Настройка БД](./DATABASE_SETUP.md)
