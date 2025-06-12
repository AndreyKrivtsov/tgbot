# 🧪 Юнит-тестирование

Это руководство по настройке и запуску юнит-тестов для Telegram бота.

## 📋 Содержание

- [Структура тестов](#структура-тестов)
- [Настройка](#настройка)
- [Запуск тестов](#запуск-тестов)
- [Написание тестов](#написание-тестов)
- [Моки и утилиты](#моки-и-утилиты)
- [Примеры тестов](#примеры-тестов)

## 🏗️ Структура тестов

```
src/__tests__/
├── setup.ts                     # Глобальная настройка тестов
├── unit/                        # Юнит-тесты
│   ├── core/                    # Тесты архитектурных компонентов
│   │   └── Container.test.ts    # Тесты DI контейнера
│   ├── services/                # Тесты бизнес-сервисов
│   │   ├── CaptchaService.test.ts
│   │   ├── AntiSpamService.test.ts
│   │   └── AIChatService.test.ts
│   └── config.test.ts           # Тесты конфигурации
└── README.md                    # Эта документация
```

## ⚙️ Настройка

### Зависимости

Убедитесь, что у вас установлены необходимые зависимости:

```bash
npm install --save-dev jest @types/jest ts-jest
```

### Конфигурация

Тесты настроены через `jest.config.js` в корне проекта:

- **TypeScript**: Поддержка ES модулей через `ts-jest`
- **Test environment**: Node.js
- **Coverage**: Включен сбор покрытия кода
- **Setup**: Глобальная настройка через `setup.ts`

## 🚀 Запуск тестов

### Основные команды

```bash
# Запуск всех тестов
npm test

# Запуск тестов в режиме наблюдения
npm run test:watch

# Запуск тестов с покрытием кода
npm run test:coverage

# Запуск тестов для CI/CD
npm run test:ci
```

### Запуск конкретных тестов

```bash
# Запуск тестов определенного файла
npm test Container.test.ts

# Запуск тестов с определенным паттерном
npm test -- --testNamePattern="Captcha"

# Запуск тестов в определенной папке
npm test src/__tests__/unit/services/
```

## ✍️ Написание тестов

### Базовая структура теста

```typescript
import { beforeEach, describe, expect, test } from "jest"

describe("Название компонента", () => {
  let service: MyService

  beforeEach(() => {
    service = new MyService()
  })

  describe("Группа тестов", () => {
    test("должен выполнять определенное действие", () => {
      // Arrange - подготовка данных
      const input = "test input"

      // Act - выполнение действия
      const result = service.processInput(input)

      // Assert - проверка результата
      expect(result).toBe("expected output")
    })
  })
})
```

### Принципы написания тестов

1. **AAA Pattern**: Arrange, Act, Assert
2. **Описательные имена**: Используйте понятные имена тестов
3. **Один тест - одна проверка**: Каждый тест проверяет одну конкретную функциональность
4. **Изоляция**: Тесты должны быть независимыми друг от друга

## 🎭 Моки и утилиты

### Глобальные утилиты

В файле `setup.ts` доступны глобальные утилиты:

```typescript
// Мокирование времени
global.testUtils.mockTime(Date.now())
global.testUtils.restoreTime()

// Создание фейковых данных
const fakeUser = global.testUtils.createFakeUser(123456)
const fakeChat = global.testUtils.createFakeChat(-1001234567890)
const fakeMessage = global.testUtils.createFakeMessage("Hello")

// Асинхронное ожидание
await global.testUtils.sleep(100)
```

### Мокирование внешних зависимостей

```typescript
import { jest } from "@jest/globals"

// Мокирование модуля
jest.mock("../../../services/AIService/index.js", () => ({
  AIService: jest.fn().mockImplementation(() => ({
    processMessage: jest.fn().mockResolvedValue("AI response"),
  })),
}))

// Мокирование функций
const mockFunction = jest.fn()
mockFunction.mockReturnValue("mocked value")
mockFunction.mockResolvedValue("async mocked value")
```

### Работа с таймерами

```typescript
// Мокирование таймеров
jest.useFakeTimers()

// Продвижение времени
jest.advanceTimersByTime(60000) // 60 секунд

// Восстановление реальных таймеров
jest.useRealTimers()
```

## 📝 Примеры тестов

### Тестирование асинхронных операций

```typescript
it("должен обрабатывать асинхронные операции", async () => {
  const service = new AsyncService()

  const result = await service.asyncMethod()

  expect(result).toBe("expected result")
})
```

### Тестирование ошибок

```typescript
it("должен выбрасывать ошибку при некорректных данных", () => {
  const service = new Service()

  expect(() => {
    service.processInvalidData(null)
  }).toThrow("Invalid data provided")
})

it("должен обрабатывать асинхронные ошибки", async () => {
  const service = new AsyncService()

  await expect(service.failingMethod()).rejects.toThrow("Async error")
})
```

### Тестирование колбэков

```typescript
it("должен вызывать колбэк при успешном выполнении", () => {
  const service = new CallbackService()
  const callback = jest.fn()

  service.processWithCallback("data", callback)

  expect(callback).toHaveBeenCalledWith("processed data")
  expect(callback).toHaveBeenCalledTimes(1)
})
```

## 🎯 Рекомендации

### Что тестировать

1. **Бизнес-логику**: Основные алгоритмы и правила
2. **Граничные случаи**: Крайние значения и исключения
3. **Интеграционные точки**: Взаимодействие между компонентами
4. **Конфигурацию**: Правильность настроек

### Что НЕ тестировать

1. **Внешние библиотеки**: Jest, axios, и т.д.
2. **Тривиальные геттеры/сеттеры**: Простые accessor методы
3. **Приватные методы**: Тестируйте публичный API

### Покрытие кода

Стремитесь к покрытию:
- **Statements**: > 80%
- **Branches**: > 75%
- **Functions**: > 85%
- **Lines**: > 80%

## 🔧 Отладка тестов

### Логирование в тестах

```typescript
it("отладочный тест", () => {
  const result = service.method()

  // Временное логирование для отладки
  console.log("Debug result:", result)

  expect(result).toBeDefined()
})
```

### Запуск одного теста

```bash
# Запуск только одного теста (используйте .only)
test.only('только этот тест будет выполнен', () => {
  // ...
});

# Пропуск теста
test.skip('этот тест будет пропущен', () => {
  // ...
});
```

## 🚨 Частые проблемы

### Проблемы с ES модулями

Если возникают проблемы с импортами:

```typescript
// Используйте .js расширения в импортах
import { Service } from "../../../services/Service/index.js"
```

### Проблемы с таймерами

```typescript
// Всегда очищайте таймеры после тестов
afterEach(() => {
  jest.useRealTimers()
  jest.clearAllTimers()
})
```

### Проблемы с асинхронностью

```typescript
// Используйте async/await или return Promise
it("async test", async () => {
  await expect(asyncOperation()).resolves.toBe("result")
})
```

---

> 💡 **Совет**: Начинайте с простых тестов и постепенно добавляйте сложность. Хорошие тесты - это инвестиция в стабильность вашего кода!
