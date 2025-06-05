# Настройка веб-интерфейса

## 📁 Структура проекта

```
app/src/web/
├── static/           # Статические файлы (будущий билд React)
├── frontend/         # Исходники React приложения  
├── SETUP.md         # Эта инструкция
└── README.md        # Документация архитектуры
```

## 🚀 Текущее состояние

✅ **Готово:**
- WebServerService создан и интегрирован
- Архитектура поддерживает веб-интерфейс
- Структура папок создана
- Graceful fallback без Fastify

❌ **Требует установки:**
- Node.js v18+ или v20+
- Fastify зависимости

## 🛠️ Быстрый старт

### 1. Обновление Node.js

**Текущая версия:** 14.17.6 (устарела)
**Требуется:** Node.js v18+ или v20+

Скачайте новую версию: https://nodejs.org/

### 2. Установка зависимостей

После обновления Node.js:

```bash
cd app
npm install fastify @fastify/cors @fastify/static
```

### 3. Добавление в package.json

```json
{
  "dependencies": {
    "fastify": "^5.2.0",
    "@fastify/cors": "^10.0.1", 
    "@fastify/static": "^8.0.2"
  }
}
```

### 4. Запуск

```bash
npm run dev
```

Веб-интерфейс будет доступен:
- **Локально**: http://localhost:3000/admin
- **В сети**: http://0.0.0.0:3000/admin

## 📱 Telegram WebApp интеграция

### Настройка бота

1. Откройте [@BotFather](https://t.me/BotFather)
2. Выберите вашего бота  
3. Команда `/setmenubutton`
4. Текст: "Админ панель"
5. URL: `https://yourdomain.com/admin`

### Локальная разработка

Используйте ngrok для туннеля:

```bash
# Глобальная установка
npm install -g ngrok

# Создание туннеля  
ngrok http 3000

# Пример URL: https://abc123.ngrok.io/admin
```

## ⚙️ Конфигурация

В файле `.env`:

```env
# Веб-сервер
WEB_PORT=3000
WEB_HOST=0.0.0.0

# Telegram
ADMIN_USERNAME=your_telegram_username
```

## 🎨 React приложение (Будущее)

### Планируемый стек:

- **React 18** + TypeScript
- **Vite** для быстрой сборки
- **TailwindCSS** для стилей
- **React Query** для API
- **Zustand** для состояния

### Создание React приложения:

```bash
cd app/src/web/frontend
npm create vite@latest . -- --template react-ts

# Дополнительные библиотеки
npm install @tanstack/react-query zustand react-hook-form
npm install -D tailwindcss postcss autoprefixer

# Telegram WebApp SDK
npm install @twa-dev/sdk
```

### Структура компонентов:

```
frontend/src/
├── components/
│   ├── Dashboard/
│   │   ├── Stats.tsx
│   │   └── Overview.tsx
│   ├── Settings/
│   │   ├── CaptchaSettings.tsx
│   │   ├── AntiSpamSettings.tsx
│   │   └── AISettings.tsx
│   └── UI/
│       ├── Toggle.tsx
│       ├── Input.tsx
│       └── Button.tsx
├── hooks/
│   ├── useConfig.ts
│   ├── useStats.ts
│   └── useTelegram.ts
├── services/
│   ├── api.ts
│   └── telegram.ts
└── types/
    ├── config.ts
    └── stats.ts
```

## 🔧 API Endpoints

WebServerService предоставляет:

- `GET /api/health` - Состояние сервисов
- `GET /api/config` - Конфигурация бота
- `POST /api/config` - Обновление конфигурации  
- `GET /api/stats` - Статистика

### Пример использования:

```typescript
// Получение конфигурации
const response = await fetch('/api/config')
const { config } = await response.json()

// Обновление настроек
await fetch('/api/config', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    captchaEnabled: true,
    aiDailyLimit: 2000
  })
})
```

## 🔐 Безопасность

### Telegram WebApp авторизация

```typescript
// Проверка пользователя
function validateTelegramUser(initData: string) {
  // Проверка подписи Telegram
  // Проверка временной метки  
  // Проверка прав администратора
}
```

### CORS настройки

По умолчанию разрешены все origins. Для production:

```typescript
await fastify.register(corsModule.default, {
  origin: ['https://yourdomain.com'],
  methods: ['GET', 'POST'],
  credentials: true
})
```

## 📊 Функциональность

### Текущие возможности:

- ✅ Настройка капчи (включение, таймаут)
- ✅ Настройка антиспама (порог срабатывания)
- ✅ Настройка AI чата (лимит запросов)
- ✅ Отображение статистики
- ✅ Конфигурация через API

### Планируемые возможности:

- [ ] Реальная интеграция с БД
- [ ] Push-уведомления об изменениях
- [ ] Графики и аналитика
- [ ] Управление пользователями
- [ ] Логи в реальном времени
- [ ] Backup и restore настроек
- [ ] Темная/светлая тема
- [ ] Мультиязычность

## 🐛 Отладка

### Проверка статуса:

```bash
# Проверка компиляции
npm run build

# Запуск в dev режиме
npm run dev

# Проверка логов
tail -f logs/app.log
```

### Типичные проблемы:

1. **Node.js устарел** → Обновите до v18+
2. **Fastify не установлен** → `npm install fastify`
3. **Порт занят** → Измените `WEB_PORT` в .env
4. **CORS ошибки** → Проверьте origin домена
5. **Telegram WebApp не работает** → Нужен HTTPS

## 📈 Производительность

### Оптимизации:

- Lazy loading компонентов
- Мемоизация API запросов
- Виртуализация больших списков
- Service Worker для кеширования
- Compression middleware

### Мониторинг:

```typescript
// Health check с метриками
const health = {
  status: "ok",
  uptime: process.uptime(),
  memory: process.memoryUsage(),
  services: {
    webServer: true,
    database: true,
    telegramBot: true
  }
}
```

## 🚀 Деплой

### Development:

```bash
npm run dev
```

### Production:

```bash
npm run build
npm start
```

### Docker:

```dockerfile
FROM node:18-alpine
COPY . /app
WORKDIR /app
RUN npm ci --only=production
EXPOSE 3000
CMD ["npm", "start"]
```

---

**Статус проекта:** ⚡ Готов к разработке веб-интерфейса
**Следующий шаг:** Обновление Node.js и установка Fastify 