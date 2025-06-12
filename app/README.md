# 🤖 Telegram Bot - Современная архитектура

Модульный Telegram бот с функциями капчи, антиспама и AI чата на базе TypeScript + GramIO + Gemini API.

## 🎯 Основные функции

- **🔐 Капча** - Проверка новых пользователей математическими задачами
- **🛡️ Антиспам** - Фильтрация первых 5 сообщений через AI + базовые правила
- **🤖 AI Чат** - Общение с пользователями через Google Gemini 2.5
- **🌐 Веб-панель** - Администрирование через Telegram WebApp

## 🚀 Быстрый старт

```bash
# 1. Установка зависимостей
cd app
npm install

# 2. Настройка базы данных (см. docs/DATABASE_SETUP.md)
# PostgreSQL + Redis для оптимальной производительности

# 3. Настройка окружения
cp .env.example .env
# Заполнить BOT_TOKEN, DATABASE_URL, REDIS_URL
# AI_API_KEY теперь настраивается для каждого чата через команды бота

# 4. Запуск миграций
npm run db:migrate

# 5. Сборка и запуск
npm run build
npm start
```

## 📚 Документация

### 📖 Основная документация
- **[ARCHITECTURE_OVERVIEW.md](docs/ARCHITECTURE_OVERVIEW.md)** - Полное описание архитектуры
- **[BOT_LOGIC_REFERENCE.md](docs/BOT_LOGIC_REFERENCE.md)** - Краткий справочник логики бота
- **[ARCHITECTURE_DIAGRAM.md](docs/ARCHITECTURE_DIAGRAM.md)** - Диаграммы архитектуры
- **[DATABASE_SETUP.md](docs/DATABASE_SETUP.md)** - 🗄️ Настройка баз данных
- **[docs/TESTING_GUIDE.md](docs/TESTING_GUIDE.md)** - 🧪 Полное руководство по тестированию

### 🏗️ Архитектурные принципы
- **Dependency Injection** - все зависимости инжектируются через конструктор
- **Service Lifecycle** - управление жизненным циклом через IService интерфейс
- **Модульность** - каждый сервис отвечает за одну функцию
- **Асинхронность** - неблокирующие операции, очереди, throttling

### 📁 Структура проекта
```
app/src/
├── core/                    # Архитектурные компоненты
│   ├── Container.ts         # DI контейнер
│   └── Application.ts       # Оркестратор сервисов
├── services/                # Бизнес-сервисы (модульная структура)
│   ├── TelegramBot/         # Главный сервис бота
│   │   └── index.ts
│   ├── DatabaseService/     # 🗄️ PostgreSQL + Drizzle ORM
│   │   └── index.ts
│   ├── RedisService/        # 🔄 Redis для кэширования
│   │   └── index.ts
│   ├── CaptchaService/      # Сервис капчи
│   │   └── index.ts
│   ├── AntiSpamService/     # Сервис антиспама
│   │   └── index.ts
│   ├── AIChatService/       # Сервис AI чата
│   │   └── index.ts
│   ├── CacheService/        # Сервис кэша
│   │   └── index.ts
│   ├── AI/                  # Сервис AI API
│   │   └── index.ts
│   ├── ApiServerService/    # API-сервер
│   │   └── index.ts
│   └── weather/             # Сервис погоды
│       └── WeatherService.ts
├── db/                      # База данных
│   └── schema.ts            # Drizzle ORM схема
├── helpers/                 # Утилиты
├── repository/              # Слой данных
├── web/                     # Веб-интерфейс
├── __tests__/               # 🧪 Тесты
│   ├── unit/services/       # Юнит-тесты сервисов
│   ├── setup.ts             # Настройка тестов
│   └── README.md            # Документация по тестированию
├── app.ts                   # Главный класс приложения
├── index.ts                 # Точка входа
└── config.ts                # Конфигурация
```

### 🎯 Преимущества модульной структуры

**✅ Что дает новая структура сервисов:**
- **Изолированность** - каждый сервис в отдельной папке
- **Расширяемость** - можно добавлять утилиты, типы и вспомогательные файлы рядом с сервисом
- **Удобство рефакторинга** - легко найти и модифицировать код конкретного сервиса
- **Чистота архитектуры** - корень `services/` больше не захламлен файлами

**🔧 Возможности для расширения:**
```
services/TelegramBot/
├── index.ts                 # Основной сервис
├── types.ts                 # Типы сервиса
├── utils.ts                 # Утилиты
├── handlers/                # Обработчики событий
│   ├── messageHandler.ts
│   └── callbackHandler.ts
└── middleware/              # Миддлвары
    └── authMiddleware.ts
```

## 🎮 Логика работы

### 🔐 Капча
```
Новый пользователь → Генерация примера (5+3=?) → InlineKeyboard →
60 сек таймаут → Правильный ответ: ✅ приветствие | Неправильный: ❌ бан 1 час
```

### 🛡️ Антиспам
```
Первые 5 сообщений → Базовые фильтры → AI проверка →
Спам: ❌ удаление + предупреждение | Не спам: ✅ пропуск
```

### 🤖 AI Чат
```
@bot или "эй бот" → Проверка лимитов → Очередь → Gemini API →
Throttling 3 сек → Ответ в чат + обновление контекста
```

## 🗄️ База данных

### Архитектура БД для максимальной производительности:

**🎯 PostgreSQL + Redis** - комбинированный подход
- **PostgreSQL** - основное хранилище (пользователи, AI контексты, статистика)
- **Redis** - высокоскоростной кэш (капча, антиспам, лимиты)

### Схема данных:
```sql
-- Основные таблицы (PostgreSQL)
users          # Пользователи с статистикой
chats          # Чаты и их настройки
ai_contexts    # AI контексты с JSONB
chat_members   # Участники и их статус
bot_stats      # Статистика работы бота
event_logs     # Лог важных событий

-- Кэш (Redis) с TTL
captcha:user:* # Капча (5 мин)
antispam:user:* # Антиспам (24 часа)
ai:limit:*     # AI лимиты (до конца дня)
user:*         # Кэш пользователей (1 час)
```

### Команды БД:
```bash
npm run db:generate  # Генерация миграций
npm run db:migrate   # Применение миграций
npm run db:studio    # Веб-интерфейс БД
npm run db:push      # Push схемы (dev)
```

**📖 Подробная настройка**: [DATABASE_SETUP.md](docs/DATABASE_SETUP.md)

## ⚙️ Конфигурация

### Переменные окружения (.env)
```bash
# Основные
BOT_TOKEN=your_telegram_bot_token

# База данных (обязательно)
DATABASE_URL=postgresql://username:password@localhost:5432/tgbot

# Redis (опционально, для производительности)
REDIS_URL=redis://localhost:6379/0

# Веб-сервер
PORT=3000

# Настройки бота
ADMIN_USERNAME=@admin_username

# Заметка: AI_API_KEY теперь настраивается для каждого чата отдельно через команды бота
# DEFAULT_CHAT_ID больше не используется в мультичатовом боте
```

### Константы бота
```typescript
CAPTCHA_TIMEOUT = 60000        # 60 секунд на решение капчи
MAX_MESSAGES_TO_CHECK = 5      # Проверяем первые 5 сообщений
DAILY_LIMIT = 1500             # Дневной лимит AI запросов
MAX_QUEUE_SIZE = 8             # Максимальный размер очереди AI
THROTTLE_DELAY = 3000          # 3 секунды между AI запросами
```

## 🌐 API и веб-интерфейс

### REST API
```typescript
GET / api / health // Статус приложения
GET / api / health / database // Статус PostgreSQL
GET / api / health / redis // Статус Redis
GET / api / config // Конфигурация бота (только создатель)
POST / api / config // Обновление конфигурации
GET / api / stats // Статистика сервисов
GET / api / stats / database // Статистика БД
GET / admin // Telegram WebApp интерфейс
```

### Telegram WebApp
- 🔐 Настройки капчи (вкл/выкл, таймаут)
- 🛡️ Настройки антиспама (количество проверяемых сообщений)
- 🤖 Настройки AI чата (дневной лимит, вкл/выкл)
- 📊 Статистика по всем сервисам
- 🗄️ Статистика базы данных

**URL**: `http://localhost:3000/admin`

## 🛠️ Разработка

### Команды NPM
```bash
npm run build       # Сборка TypeScript
npm start           # Запуск приложения
npm run dev         # Разработка с watch mode
npm run prod        # Продакшн сборка + запуск

# База данных
npm run db:generate # Генерация миграций
npm run db:migrate  # Применение миграций
npm run db:studio   # Веб-интерфейс БД
npm run db:push     # Push схемы (dev only)

# Тестирование
npm test            # Запуск всех тестов
npm run test:watch  # Тесты в режиме наблюдения
npm run test:coverage # Тесты с покрытием кода
npm run test:ci     # Тесты для CI/CD

# Качество кода
npm run lint        # Линтинг кода
npm run lint:fix    # Автоисправление
```

### Добавление нового сервиса
1. Создать класс, реализующий `IService`
2. Зарегистрировать в `Application.ts`
3. Добавить зависимости через DI

### Расширение логики бота
```typescript
// В TelegramBotService.setupEventHandlers()
this.bot.on("new_event", (context) => {
  this.handleNewEvent(context)
})
```

## 📊 Статистика и мониторинг

### Логи
```
[05.06.2025 20:24:45][App][INFO]: ✅ Telegram bot started: @test_ai_group_bot
[05.06.2025 20:24:45][App][INFO]: ✅ Database service started - connection successful
[05.06.2025 20:24:45][App][INFO]: ✅ Redis service started successfully
[05.06.2025 20:24:45][App][INFO]: 🌍 Environment: development
[05.06.2025 20:24:45][App][INFO]: 🤖 Bot mode: enabled
[05.06.2025 20:24:45][App][INFO]: 🎉 Application is running!
```

### Health Checks
- **isHealthy()** - проверка состояния каждого сервиса
- **getStats()** - статистика сервиса
- **/api/health** - общий статус приложения
- **/api/health/database** - PostgreSQL статус + латентность
- **/api/health/redis** - Redis статус + латентность

### Мониторинг производительности
- **PostgreSQL**: подключения, латентность запросов, размер БД
- **Redis**: использование памяти, hit ratio, латентность команд
- **Telegram Bot**: rate limits, ошибки API, статистика сообщений

## 🐳 Развертывание

### Docker Compose с БД
```yaml
version: "3.8"
services:
  bot:
    build: .
    environment:
      - BOT_TOKEN=${BOT_TOKEN}
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/tgbot
      - REDIS_URL=redis://redis:6379/0
      - AI_API_KEY=${AI_API_KEY}
    ports:
      - "3000:3000"
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: tgbot
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

## 📈 Технологический стек

- **TypeScript** - типизированный JavaScript
- **Node.js** - серверная платформа
- **GramIO** - современная Telegram Bot API библиотека
- **Google Gemini 2.5** - AI для чата и антиспама
- **Fastify** - быстрый веб-фреймворк
- **PostgreSQL 15+** - основная база данных с JSONB
- **Drizzle ORM** - type-safe ORM для PostgreSQL
- **Redis 7+** - высокоскоростное кэширование
- **Jest** - 🧪 фреймворк для тестирования
- **Docker** - контейнеризация для развертывания

## 🎯 Производительность

### Оптимизации:
- **Connection pooling** (20 для PostgreSQL, 10 для Redis)
- **Подготовленные запросы** через Drizzle ORM
- **JSONB индексы** для AI контекстов
- **Redis TTL** для автоочистки кэша
- **Graceful shutdown** для корректного завершения

### Benchmarks:
- **Капча**: < 200ms генерация + отправка
- **Антиспам**: < 500ms проверка через AI
- **AI чат**: < 3s ответ (с throttling)
- **Database**: < 10ms типичные запросы
- **Redis**: < 1ms операции кэширования

**🚀 Эта архитектура обеспечивает высокую производительность и надежность для Telegram ботов любого масштаба!**

## 📝 Лицензия

MIT License - см. файл [LICENSE](LICENSE)

---

## 🤝 Участие в разработке

1. Fork репозитория
2. Создать ветку для новой функции (`git checkout -b feature/amazing-feature`)
3. Commit изменений (`git commit -m 'Add some amazing feature'`)
4. Push в ветку (`git push origin feature/amazing-feature`)
5. Создать Pull Request

---

*Проект обновлен: 05.06.2025*
*Версия: 2.0*
*Статус: ✅ Рабочий прототип*
