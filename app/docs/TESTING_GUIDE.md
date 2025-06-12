# 🧪 Руководство по тестированию

## 📋 Содержание

- [Обзор](#обзор)
- [Структура тестов](#структура-тестов)
- [Настройка окружения](#настройка-окружения)
- [Типы тестов](#типы-тестов)
- [Запуск тестов](#запуск-тестов)
- [Написание тестов](#написание-тестов)
- [Моки и утилиты](#моки-и-утилиты)
- [Покрытие кода](#покрытие-кода)
- [CI/CD интеграция](#cicd-интеграция)

## 🎯 Обзор

Проект использует **Jest** в качестве основного фреймворка для тестирования с полной поддержкой TypeScript. Система тестирования включает unit-тесты для отдельных компонентов и integration-тесты для проверки взаимодействия между сервисами.

### Технологический стек:
- **Jest** - основной фреймворк тестирования
- **ts-jest** - поддержка TypeScript
- **@types/jest** - типы для Jest
- **Node.js Test Environment** - окружение для выполнения тестов

### Принципы тестирования:
- **DI-friendly testing** - использование Dependency Injection для изоляции компонентов
- **Mocking external dependencies** - изоляция от внешних сервисов
- **Comprehensive coverage** - максимальное покрытие критической логики
- **Fast execution** - быстрое выполнение тестов

## 🏗️ Структура тестов

```
app/src/__tests__/
├── setup.ts                        # Глобальная настройка тестовой среды
├── unit/                           # Unit-тесты отдельных компонентов
│   ├── core/                       # Тесты архитектурных компонентов
│   │   └── Container.test.ts       # DI контейнер
│   └── services/                   # Тесты бизнес-сервисов
│       ├── CaptchaService.test.ts  # Система капчи
│       ├── AntiSpamService.test.ts # Антиспам сервис
│       └── AIChatService.test.ts   # ИИ чат сервис
├── integration/                    # Integration-тесты
│   ├── database.test.ts           # Интеграционные тесты БД
│   └── telegram-bot.test.ts       # Тесты Telegram бота
└── README.md                      # Документация тестов
```

### Соглашения по именованию:
- **Unit-тесты**: `ComponentName.test.ts`
- **Integration-тесты**: `feature-name.test.ts`
- **Mock файлы**: `__mocks__/ModuleName.ts`
- **Утилиты**: `test-utils/UtilityName.ts`

## ⚙️ Настройка окружения

### Конфигурация Jest (`jest.config.js`):

```javascript
export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  moduleNameMapping: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }],
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/**/index.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
}
```

### Глобальная настройка (`setup.ts`):

```typescript
import { beforeEach, afterEach } from 'jest'

// Глобальные утилиты для тестов
declare global {
  var testUtils: {
    mockTime: (timestamp: number) => void
    restoreTime: () => void
    createFakeUser: (id: number) => any
    createFakeChat: (id: number) => any
    createFakeMessage: (text: string) => any
    sleep: (ms: number) => Promise<void>
  }
}

// Реализация утилит
global.testUtils = {
  mockTime: (timestamp: number) => {
    jest.useFakeTimers()
    jest.setSystemTime(new Date(timestamp))
  },
  
  restoreTime: () => {
    jest.useRealTimers()
  },
  
  createFakeUser: (id: number) => ({
    id,
    first_name: 'Test User',
    username: `testuser${id}`,
  }),
  
  // ... другие утилиты
}
```

## 🧩 Типы тестов

### 1. Unit-тесты

Тестируют отдельные компоненты в изоляции:

```typescript
// src/__tests__/unit/services/CaptchaService.test.ts
import { CaptchaService } from '../../../services/CaptchaService/index.js'

describe('CaptchaService', () => {
  let service: CaptchaService
  
  beforeEach(() => {
    const mockConfig = { /* mock config */ }
    const mockLogger = { /* mock logger */ }
    service = new CaptchaService(mockConfig, mockLogger)
  })
  
  test('должен генерировать математическую задачу', () => {
    const challenge = service.generateChallenge()
    
    expect(challenge.question).toMatch(/\d+ [+\-*/] \d+ = \?/)
    expect(challenge.options).toHaveLength(4)
    expect(challenge.options).toContain(challenge.correctAnswer)
  })
})
```

### 2. Integration-тесты

Тестируют взаимодействие между компонентами:

```typescript
// src/__tests__/integration/database.test.ts
import { Container } from '../../core/Container.js'
import { Application } from '../../core/Application.js'

describe('Database Integration', () => {
  let container: Container
  let app: Application
  
  beforeEach(async () => {
    container = new Container(mockLogger)
    app = new Application(container, mockLogger, testConfig)
    await app.initialize()
  })
  
  afterEach(async () => {
    await container.dispose()
  })
  
  test('должен сохранять и получать конфигурацию чата', async () => {
    const chatRepo = await container.getAsync('chatRepository')
    
    await chatRepo.saveChatConfig(123, { aiEnabled: true })
    const config = await chatRepo.getChatConfig(123)
    
    expect(config.aiEnabled).toBe(true)
  })
})
```

## 🚀 Запуск тестов

### Основные команды:

```bash
# Запуск всех тестов
npm test

# Тесты в режиме watch (для разработки)
npm run test:watch

# Запуск с покрытием кода
npm run test:coverage

# Только unit-тесты
npm run test:unit

# Только integration-тесты
npm run test:integration

# Для CI/CD (без watch)
npm run test:ci
```

### Фильтрация тестов:

```bash
# Запуск конкретного файла
npm test CaptchaService.test.ts

# Запуск тестов по паттерну названия
npm test -- --testNamePattern="Captcha"

# Запуск тестов в определенной папке
npm test src/__tests__/unit/services/

# Запуск только измененных тестов
npm test -- --onlyChanged
```

### Режимы отладки:

```bash
# Запуск с дополнительной информацией
npm test -- --verbose

# Отладка через Node.js инспектор
npm test -- --runInBand --inspect-brk

# Запуск с помощью VS Code debugger
npm test -- --runInBand --no-coverage
```

## ✍️ Написание тестов

### 1. Архитектура теста (AAA Pattern):

```typescript
describe('AntiSpamService', () => {
  test('должен определять спам сообщения', async () => {
    // Arrange - подготовка
    const service = new AntiSpamService(mockConfig, mockLogger)
    const spamMessage = 'Купи криптовалюту! Ссылка: example.com'
    
    // Act - выполнение
    const result = await service.checkMessage(123, spamMessage)
    
    // Assert - проверка
    expect(result.isSpam).toBe(true)
    expect(result.confidence).toBeGreaterThan(0.5)
  })
})
```

### 2. Тестирование асинхронного кода:

```typescript
test('должен обрабатывать таймауты API', async () => {
  // Мокируем медленный API
  const slowApiMock = jest.fn().mockImplementation(
    () => new Promise(resolve => setTimeout(resolve, 10000))
  )
  
  service.setApiClient(slowApiMock)
  
  // Проверяем, что таймаут срабатывает
  const result = await service.checkMessage(123, 'test')
  
  expect(result.error).toContain('timeout')
})
```

### 3. Тестирование ошибок:

```typescript
test('должен выбрасывать ошибку при неверной конфигурации', () => {
  expect(() => {
    new CaptchaService(invalidConfig, mockLogger)
  }).toThrow('Invalid configuration')
})

test('должен обрабатывать ошибки API', async () => {
  const failingApiMock = jest.fn().mockRejectedValue(
    new Error('API unavailable')
  )
  
  service.setApiClient(failingApiMock)
  
  await expect(service.checkMessage(123, 'test'))
    .rejects.toThrow('API unavailable')
})
```

## 🎭 Моки и утилиты

### 1. Мокирование внешних зависимостей:

```typescript
// Мокирование модуля
jest.mock('../../../config.js', () => ({
  config: {
    BOT_TOKEN: 'test-token',
    DATABASE_URL: 'test-db-url',
    ANTISPAM_URL: 'http://test-antispam-api',
  }
}))

// Мокирование класса
jest.mock('../../../services/RedisService/index.js', () => ({
  RedisService: jest.fn().mockImplementation(() => ({
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  }))
}))
```

### 2. Создание test doubles:

```typescript
// Stub - простая заглушка
const loggerStub = {
  i: jest.fn(),
  w: jest.fn(),
  e: jest.fn(),
  d: jest.fn(),
}

// Mock - контролируемая заглушка
const apiClientMock = {
  post: jest.fn().mockResolvedValue({ 
    ok: true, 
    json: () => Promise.resolve({ is_spam: false })
  })
}

// Spy - слежение за вызовами
const originalMethod = service.processMessage
const processMessageSpy = jest.spyOn(service, 'processMessage')
```

### 3. Работа с временем:

```typescript
beforeEach(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2024-01-01'))
})

afterEach(() => {
  jest.useRealTimers()
})

test('должен удалять просроченные капчи', () => {
  service.createCaptcha(123)
  
  // Продвигаем время на 2 минуты
  jest.advanceTimersByTime(120000)
  
  service.cleanupExpiredCaptchas()
  
  expect(service.getCaptcha(123)).toBeNull()
})
```

## 📊 Покрытие кода

### Настройка покрытия:

```javascript
// jest.config.js
module.exports = {
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/index.ts',
    '!src/**/__mocks__/**',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
    './src/core/': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },
}
```

### Анализ покрытия:

```bash
# Генерация отчета о покрытии
npm run test:coverage

# Просмотр HTML отчета
open coverage/lcov-report/index.html

# Проверка порогов покрытия
npm run test:ci
```

### Типы метрик покрытия:
- **Lines**: процент выполненных строк
- **Functions**: процент вызванных функций  
- **Branches**: процент пройденных веток условий
- **Statements**: процент выполненных выражений

## 🔄 CI/CD интеграция

### GitHub Actions workflow:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm run test:ci
    
    - name: Upload coverage
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage/lcov.info
```

### Локальная проверка перед коммитом:

```bash
# package.json scripts
{
  "scripts": {
    "precommit": "npm run lint && npm run test:ci",
    "prepush": "npm run test:coverage"
  }
}
```

## 🛠️ Лучшие практики

### 1. Структура тестов:
- Группируйте связанные тесты в `describe` блоки
- Используйте понятные названия тестов
- Следуйте принципу AAA (Arrange, Act, Assert)

### 2. Изоляция тестов:
- Каждый тест должен быть независимым
- Используйте `beforeEach`/`afterEach` для настройки/очистки
- Мокируйте все внешние зависимости

### 3. Читаемость:
- Пишите тесты как живую документацию
- Используйте осмысленные данные для тестов
- Добавляйте комментарии для сложной логики

### 4. Производительность:
- Избегайте реальных HTTP запросов
- Используйте in-memory базы данных для тестов
- Группируйте медленные тесты отдельно

---

> 💡 **Следующие разделы**: [Настройка БД](./DATABASE_SETUP.md) | [Архитектура](./ARCHITECTURE_OVERVIEW.md)
