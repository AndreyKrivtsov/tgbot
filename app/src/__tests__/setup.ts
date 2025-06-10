// Глобальные настройки для тестов

// Отключаем логирование во время тестов (в режиме test)
const originalConsole = console;

// Базовые моки для переменных окружения
process.env.NODE_ENV = 'test';
process.env.TELEGRAM_BOT_TOKEN = 'test_token';
process.env.GEMINI_API_KEY = 'test_key';
process.env.POSTGRES_URL = 'postgresql://test:test@localhost:5432/test';
process.env.REDIS_URL = 'redis://localhost:6379';

// Глобальные утилиты для тестов
global.testUtils = {
  // Утилита для создания моков времени
  mockTime: (timestamp: number) => {
    // Mock implementation
    console.log('Mock time set to:', timestamp);
  },
  
  // Утилита для восстановления времени
  restoreTime: () => {
    // Mock implementation
    console.log('Time restored');
  },
  
  // Утилита для ожидания
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Утилита для создания фейковых данных
  createFakeUser: (id: number = 123456) => ({
    id,
    firstName: 'Test',
    lastName: 'User',
    username: 'testuser',
  }),
  
  createFakeChat: (id: number = -1001234567890) => ({
    id,
    type: 'supergroup' as const,
    title: 'Test Chat',
  }),
  
  createFakeMessage: (text: string = 'test message', userId: number = 123456) => ({
    messageId: Math.floor(Math.random() * 1000000),
    text,
    from: global.testUtils.createFakeUser(userId),
    chat: global.testUtils.createFakeChat(),
    date: Math.floor(Date.now() / 1000),
  }),
};

// Типы для TypeScript
declare global {
  var testUtils: {
    mockTime: (timestamp: number) => void;
    restoreTime: () => void;
    sleep: (ms: number) => Promise<void>;
    createFakeUser: (id?: number) => any;
    createFakeChat: (id?: number) => any;
    createFakeMessage: (text?: string, userId?: number) => any;
  };
}

// Очистка после каждого теста
// afterEach(() => {
//   // Mock cleanup
// }); 