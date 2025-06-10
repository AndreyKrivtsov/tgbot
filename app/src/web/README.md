# Веб-интерфейс для Telegram бота

## 📁 Структура

```
app/src/web/
├── static/           # Статические файлы (React билд)
│   └── .gitkeep     # Заглушка для git
├── frontend/         # Исходники React приложения
│   └── README.md    # Планы по React приложению
├── SETUP.md         # Подробные инструкции
└── README.md        # Этот файл
```

## 🎯 Назначение

Веб-админ панель для управления настройками Telegram бота:

- **Капча** - включение, таймаут
- **Антиспам** - порог срабатывания
- **AI чат** - дневной лимит запросов
- **Статистика** - метрики работы бота
- **Общие настройки** - приветственное сообщение

## 🏗️ Архитектура

### Backend (ApiServerService)
- **Сервис**: `app/src/services/ApiServerService.ts`
- **Статус**: ✅ Готов (заглушка без Fastify)
- **API**: `/api/health`, `/api/config`, `/api/stats`

### Frontend (Планируется)
- **Технологии**: React 18 + TypeScript + Vite
- **UI**: TailwindCSS + Telegram WebApp стили
- **Состояние**: Zustand + React Query
- **Статус**: 📋 В планах

## 🚀 Быстрый старт

### 1. Обновите Node.js
Текущая версия 14.17.6 устарела. Требуется v18+

### 2. Установите зависимости
```bash
npm install fastify @fastify/cors @fastify/static
```

### 3. Запустите приложение
```bash
npm run dev
```

### 4. Откройте веб-интерфейс
- Локально: http://localhost:3000/admin
- Telegram WebApp: настройте в @BotFather

## 🎨 UI/UX

### Дизайн
- **Адаптивный** под мобильные устройства
- **Темизация** под Telegram стили
- **Современный** Material Design + iOS стили

### Интеграция с Telegram
- **WebApp SDK** для нативного ощущения
- **Haptic Feedback** для тактильных откликов
- **Главная кнопка** для основных действий
- **Темы** синхронизация с Telegram темой

## 🔧 Конфигурация

### Environment (.env)
```env
WEB_PORT=3000
WEB_HOST=0.0.0.0
ADMIN_USERNAME=your_username
```

### API структура
```typescript
interface BotConfig {
  captchaEnabled: boolean
  captchaTimeout: number
  antispamEnabled: boolean
  antispamThreshold: number
  aiChatEnabled: boolean
  aiDailyLimit: number
  welcomeMessage: string
}
```

## 🛡️ Безопасность

### Авторизация
- Только создатель бота имеет доступ
- Проверка через Telegram WebApp API
- Валидация подписи Telegram

### API Protection
- CORS настройки
- Rate limiting
- Input validation

## 📊 Мониторинг

### Health Check
```
GET /api/health
{
  "status": "ok",
  "services": {
    "apiServer": true,
    "database": true,
    "telegramBot": true
  }
}
```

### Метрики
- Время работы системы
- Количество AI запросов
- Заблокированный спам
- Решенные капчи

## 🔄 Жизненный цикл

### Разработка
1. **Текущий этап**: Структура готова, ApiServerService создан
2. **Следующий этап**: Установка Fastify, создание API
3. **Будущий этап**: React приложение, продвинутая аналитика

### Production
- **Dockerfile** для контейнеризации
- **Nginx** для reverse proxy
- **SSL/TLS** сертификаты
- **Мониторинг** с метриками

## 📚 Документация

- **SETUP.md** - Подробные инструкции по настройке
- **frontend/README.md** - Планы по React приложению
- **API docs** - Swagger/OpenAPI (планируется)

## 🎯 Roadmap

### v1.0 (Текущий)
- [x] ApiServerService интеграция
- [x] Структура папок
- [x] API endpoints планирование
- [ ] Fastify активация

### v2.0 (Ближайшее)
- [ ] React приложение
- [ ] Telegram WebApp интеграция
- [ ] Реальная БД интеграция
- [ ] Авторизация

### v3.0 (Будущее)
- [ ] Расширенная аналитика
- [ ] Пользовательские роли
- [ ] Backup/restore функции
- [ ] Мультиязычность

---

**Статус**: 🟡 В разработке
**Готовность**: 40% (архитектура + заглушки)
**Следующий шаг**: Обновление Node.js → Fastify
