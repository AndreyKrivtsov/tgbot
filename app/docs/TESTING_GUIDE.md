# 🧪 Руководство по тестированию

Полное руководство по настройке и использованию юнит-тестов в проекте Telegram Bot.

## 📋 Содержание

- [Обзор](#обзор)
- [Настройка](#настройка)
- [Запуск тестов](#запуск-тестов)
- [Существующие тесты](#существующие-тесты)
- [Написание новых тестов](#написание-новых-тестов)
- [Архитектура тестирования](#архитектура-тестирования)

## 🎯 Обзор

Проект использует **Jest** для создания и запуска тестов. Система тестирования включает:

### Типы тестов:
- **🔧 Юнит-тесты** - изолированное тестирование отдельных модулей
- **🔄 Интеграционные тесты** - тестирование взаимодействия между компонентами

### Текущее покрытие:
- **CaptchaService** ✅ (Юнит)
- **AntiSpamService** ✅ (Юнит)
- **AntiSpam Flow** ✅ (Интеграционный)
- **Captcha Flow** ✅ (Интеграционный)
- **Container** 🔄 (В планах)
- **Configuration** 🔄 (В планах)

## ⚙️ Настройка

### Зависимости

Все необходимые зависимости уже установлены:

```json
{
  "@types/jest": "^29.5.12",
  "jest": "^29.7.0",
  "ts-jest": "^29.1.2"
}
```

### Конфигурация

Настройка Jest находится в `jest.config.js`:

```javascript
export default {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: [
    "**/__tests__/**/*.test.ts",
    "**/__tests__/**/*.test.js"
  ],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
    "!src/**/__tests__/**"
  ]
}
```

## 🚀 Запуск тестов

### Основные команды

```bash
# Все тесты
npm test

# Только юнит-тесты
npm run test:unit

# Только интеграционные тесты
npm run test:integration

# Режим наблюдения
npm run test:watch

# С покрытием кода
npm run test:coverage

# CI режим
npm run test:ci
```

### Запуск конкретных тестов

```bash
# Запуск тестов определенного сервиса
npm test CaptchaService.test.js
npm test AntiSpamService.test.js

# Запуск тестов с определенным паттерном
npm test -- --testNamePattern="генерация"
```

## 📝 Существующие тесты

### CaptchaService Tests

**Файл**: `src/__tests__/unit/services/CaptchaService.test.js`

**Что тестируется**:
- ✅ Генерация корректных математических задач
- ✅ Создание уникальных вариантов ответов
- ✅ Структура объекта капчи (question, answer, options)

**Пример теста**:
```javascript
test("должен генерировать корректную математическую задачу", () => {
  const captcha = generateCaptcha()

  expect(captcha.question).toHaveLength(2)
  expect(captcha.answer).toBe(captcha.question[0] + captcha.question[1])
  expect(captcha.options).toContain(captcha.answer)
})
```

### AntiSpamService Tests

**Файл**: `src/__tests__/unit/services/AntiSpamService.test.js`

**Что тестируется**:
- ✅ Обработка нормальных сообщений
- ✅ Обработка спам сообщений
- ✅ Обработка пустых сообщений
- ✅ Создание записей пользователей
- ✅ Счетчик сообщений (лимит 5)
- ✅ Мок API ответов

**Пример мок API**:
```javascript
const mockResponse = {
  isSpam: true,
  confidence: 0.95,
  reason: "Содержит спам слова"
}

const result = checkMessageForSpam(message, mockResponse)
expect(result.action).toBe("block")
```

### 🔄 Интеграционные тесты

#### AntiSpam Flow Test (9 тестов)

**Файл**: `src/__tests__/integration/AntiSpamFlow.test.js`

**Что тестируется:**
- 📨 Получение сообщения ботом → AntiSpamService → AI API → действие
- ✅ Обработка нормальных сообщений (разрешение)
- 🚫 Обнаружение спама с мок API ответами
- 🔤 Автоматическое определение спама по ключевым словам
- 🔢 Лимит проверки (5 сообщений на пользователя)
- ❌ Обработка ошибок AI API
- 📊 Отслеживание статистики пользователей
- 🎯 Различные уровни уверенности AI (0.05 - 0.98)

**Основные сценарии:**
```javascript
// Полный флоу: нормальное сообщение
test("должен обрабатывать нормальное сообщение", async () => {
  const message = createMockMessage("Привет всем! Как дела?")
  const result = await botService.handleNewMessage(message)

  expect(result.action).toBe("allow")
  expect(result.isSpam).toBe(false)
  expect(botService.deletedMessages).toHaveLength(0)
})

// Полный флоу: спам с мок API
test("должен обнаруживать спам с мок API", async () => {
  const mockResponse = {
    isSpam: true,
    confidence: 0.85,
    reason: "Обнаружены подозрительные паттерны"
  }

  const result = await antiSpamService.checkMessage(message, mockResponse)
  expect(result.isSpam).toBe(true)
  expect(result.action).toBe("delete")
})
```

#### Captcha Flow Test (10 тестов)

**Файл**: `src/__tests__/integration/CaptchaFlow.test.js`

**Что тестируется:**
- 👋 Вход нового пользователя → ограничение → капча → ответ → результат
- 🔐 Генерация математических капч с 4 вариантами ответов
- ✅ Правильный ответ → снятие ограничений → приветствие
- ❌ Неправильный ответ → повторная попытка (3 попытки максимум)
- 👢 Превышение лимита попыток → кик пользователя
- ⏰ Таймаут капчи (1 минута) → кик пользователя
- 👥 Обработка нескольких пользователей одновременно
- 🧹 Очистка просроченных капч
- 🔍 Обработка несуществующих капч

**Основные сценарии:**
```javascript
// Полный флоу: новый пользователь
test("должен обрабатывать вход нового пользователя", async () => {
  const joinEvent = createMockJoinEvent()
  const result = await botService.handleNewMember(joinEvent)

  expect(result.action).toBe("captcha_generated")
  expect(result.captcha.question).toMatch(/\d+ \+ \d+ = \?/)
  expect(result.captcha.options).toHaveLength(4)
  expect(botService.restrictedUsers.has(mockNewUser.id)).toBe(true)
})

// Полный флоу: правильный ответ
test("должен обрабатывать правильный ответ на капчу", async () => {
  const callbackQuery = createMockCallbackQuery(
    mockNewUser.id,
    `captcha_answer_${mockNewUser.id}_${captcha.correctIndex}`,
    messageId
  )

  const result = await botService.handleCallbackQuery(callbackQuery)

  expect(result.success).toBe(true)
  expect(result.action).toBe("allow")
  expect(botService.restrictedUsers.has(mockNewUser.id)).toBe(false)
})

// Полный флоу: превышение лимита попыток
test("должен кикать пользователя после 3 неправильных ответов", async () => {
  // ... 3 неправильных ответа подряд

  expect(botService.kickedUsers).toHaveLength(1)
  expect(botService.kickedUsers[0].reason).toContain("Превышено количество попыток")
})
```

**Мок-компоненты:**
- `MockCaptchaService` - генерация капч, проверка ответов, таймауты
- `MockTelegramBotService` - ограничения, кик, отправка сообщений
- Полная симуляция callback query и inline клавиатур

## ✍️ Написание новых тестов

### Структура теста

```javascript
describe("ServiceName", () => {
  describe("Группа тестов", () => {
    test("должен выполнять определенное действие", () => {
      // Arrange - подготовка данных
      const input = "test data"

      // Act - выполнение действия
      const result = serviceFunction(input)

      // Assert - проверка результата
      expect(result).toBe("expected")
    })
  })
})
```

### Рекомендации

1. **Файлы тестов**: размещайте в `src/__tests__/unit/services/`
2. **Именование**: используйте суффикс `.test.js`
3. **Описания**: пишите на русском языке для понятности
4. **Моки**: используйте простые функции вместо сложных моков
5. **Изоляция**: каждый тест должен быть независимым

### Создание мока сервиса

```javascript
// Простая функция для тестирования логики
function serviceFunction(input, mockApiResponse) {
  // Базовая валидация
  if (!input) {
    return { error: "Нет входных данных" }
  }

  // Использование мока или дефолтного значения
  const response = mockApiResponse || { success: true }

  return {
    input,
    processed: true,
    response
  }
}
```

### Создание интеграционного теста

```javascript
// src/__tests__/integration/NewFlow.test.js
describe("New Integration Flow", () => {
  // Мок классы для симуляции сервисов
  class MockService1 {
    constructor() {
      this.events = []
      this.onEventProcessed = null
    }

    async processEvent(eventData) {
      this.events.push(eventData)
      const result = { processed: true, eventData }

      if (this.onEventProcessed) {
        this.onEventProcessed(result)
      }

      return result
    }
  }

  class MockService2 {
    constructor(service1) {
      this.service1 = service1
      this.processedResults = []

      // Подписываемся на события первого сервиса
      this.service1.onEventProcessed = (result) => {
        this.handleProcessedEvent(result)
      }
    }

    handleProcessedEvent(result) {
      console.log(`📨 Получен результат: ${result.eventData.name}`)
      this.processedResults.push(result)
    }
  }

  describe("Полный флоу обработки", () => {
    let service1, service2

    beforeEach(() => {
      service1 = new MockService1()
      service2 = new MockService2(service1)
    })

    test("должен обрабатывать полный флоу", async () => {
      // Arrange - подготовка данных
      const eventData = { name: "test-event", data: "test-data" }

      // Act - выполнение действия
      const result = await service1.processEvent(eventData)

      // Assert - проверка результата
      expect(result.processed).toBe(true)
      expect(service2.processedResults).toHaveLength(1)
      expect(service2.processedResults[0].eventData).toEqual(eventData)
    })
  })
})
```

## 🏗️ Архитектура тестирования

### Принципы

1. **Простота** - используем JavaScript вместо TypeScript для тестов
2. **Изоляция** - каждый тест независим от других
3. **Моки** - простые функции вместо сложных библиотек моков
4. **Читаемость** - понятные имена и описания на русском

### Структура папок

```
src/__tests__/
├── unit/                    # Юнит-тесты
│   ├── services/            # Тесты сервисов
│   │   ├── CaptchaService.test.js
│   │   └── AntiSpamService.test.js
│   └── core/                # Тесты архитектурных компонентов
├── integration/             # Интеграционные тесты
│   ├── AntiSpamFlow.test.js # Полный флоу антиспама
│   └── CaptchaFlow.test.js  # Полный флоу капчи
├── setup.ts                 # Глобальная настройка тестов
└── README.md                # Подробная документация
```

### Планы расширения

**Ближайшие цели**:
- [ ] Container.test.js - тестирование DI контейнера
- [ ] Config.test.js - тестирование конфигурации
- [ ] Database.test.js - тестирование подключения к БД
- [ ] Redis.test.js - тестирование кэша

**Будущие планы**:
- [ ] Интеграционные тесты для TelegramBot + CaptchaService
- [ ] Интеграционные тесты для полного флоу модерации
- [ ] E2E тесты с реальным Telegram API
- [ ] Performance тесты для нагруженных чатов
- [ ] Тесты безопасности

## 📊 Покрытие кода

### Текущие показатели

```
Test Suites: 2 passed, 2 total
Tests:       19 passed, 19 total
Time:        ~2.8s
Coverage:    AntiSpam Flow ✅ + Captcha Flow ✅
```

### Цели покрытия

- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 85%
- **Lines**: > 80%

### Просмотр отчета

```bash
# Генерация отчета о покрытии
npm run test:coverage

# Просмотр HTML отчета
open coverage/lcov-report/index.html
```

## 🔧 Отладка тестов

### Полезные команды

```bash
# Запуск только одного теста
npm test -- --testNamePattern="конкретный тест"

# Verbose режим для детальной информации
npm test -- --verbose

# Запуск с детектором открытых хендлов
npm test -- --detectOpenHandles
```

### Типичные проблемы

**Проблема**: Jest не находит тесты
**Решение**: Проверьте `testMatch` в `jest.config.js`

**Проблема**: Таймауты тестов
**Решение**: Используйте `jest.setTimeout(10000)` в тесте

**Проблема**: Моки не работают
**Решение**: Используйте простые функции вместо сложных моков

## 🎯 Best Practices

### DO ✅

- Пишите понятные описания тестов
- Используйте AAA pattern (Arrange, Act, Assert)
- Делайте тесты независимыми
- Тестируйте граничные случаи
- Используйте простые моки

### DON'T ❌

- Не тестируйте внешние библиотеки
- Не делайте тесты зависимыми друг от друга
- Не используйте реальные API в тестах
- Не забывайте очищать моки после тестов
- Не пишите слишком сложные тесты

---

## 📚 Дополнительные ресурсы

- **[Jest Documentation](https://jestjs.io/docs/getting-started)** - официальная документация
- **[Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)** - лучшие практики
- **[Основной README](../src/__tests__/README.md)** - подробная документация по тестам

---

> 💡 **Совет**: Начинайте с простых тестов и постепенно добавляйте сложность. Хорошие тесты - это инвестиция в стабильность проекта!
