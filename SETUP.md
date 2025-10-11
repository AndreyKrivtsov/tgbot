# 🚀 Руководство по настройке и запуску

Подробные инструкции по развертыванию Telegram Bot "Альтрон" в development и production режимах.

## 📋 Содержание

- [Системные требования](#системные-требования)
- [Быстрый старт (Development)](#быстрый-старт-development)
- [Production развертывание](#production-развертывание)
- [Настройка внешних сервисов](#настройка-внешних-сервисов)
- [Переменные окружения](#переменные-окружения)
- [База данных](#база-данных)
- [Тестирование](#тестирование)
- [Веб-интерфейс](#веб-интерфейс)
- [Мониторинг и логирование](#мониторинг-и-логирование)
- [Устранение неполадок](#устранение-неполадок)

## 🖥️ Системные требования

### Обязательные компоненты:
- **Node.js** v18+ или v20+ (рекомендуется v20 LTS)
- **PostgreSQL** 14+ 
- **Redis** 6+
- **Docker & Docker Compose** (для production)

### Рекомендуемые характеристики сервера:
- **RAM**: минимум 2GB (рекомендуется 4GB)
- **CPU**: минимум 2 ядра
- **Дисковое пространство**: минимум 10GB

## ⚡ Быстрый старт (Development)

### 1. Клонирование репозитория

```bash
git clone <repository-url>
cd tgbot
```

### 2. Настройка переменных окружения

```bash
# Копируем пример конфигурации
cp app/env.example app/.env

# Редактируем переменные
nano app/.env
```

Минимальная конфигурация для development:
```env
# Основные настройки
NODE_ENV=development
BOT_TOKEN=your_telegram_bot_token_from_botfather

# База данных (можно использовать Docker)
DATABASE_URL=postgresql://postgres:password@localhost:5432/tgbot

# Redis (можно использовать Docker) 
REDIS_URL=redis://localhost:6379

# Внешние сервисы (обязательные)
ANTISPAM_URL=https://your-antispam-api.com/check
LLAMA_URL=https://your-llm-api.com

# Веб-сервер
PORT=3000
ADMIN_USERNAME=your_telegram_username

# Логирование
LOG_LEVEL=2
LOG_USE_FILE=true
```

### 3. Запуск инфраструктуры (Docker)

```bash
# Переходим в папку инфраструктуры
cd infrastructure

# Запускаем PostgreSQL и Redis
docker-compose up -d postgres redis

# Проверяем статус
docker-compose ps
```

### 4. Установка зависимостей и настройка БД

```bash
# Возвращаемся в app
cd ../app

# Устанавливаем зависимости
npm install

# Генерируем миграции БД
npm run db:generate

# Применяем миграции
npm run db:migrate
```

### 5. Запуск приложения

```bash
# Development режим с hot reload
npm run dev

# Или обычный запуск
npm start
```

### 6. Проверка работы

- **Логи**: Приложение должно запуститься без ошибок
- **Telegram**: Бот должен отвечать на команду `/start`
- **Веб-интерфейс**: http://localhost:3000/api/health

## 🏭 Production развертывание

### 1. Подготовка сервера

```bash
# Обновляем систему
sudo apt update && sudo apt upgrade -y

# Устанавливаем Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Устанавливаем Docker Compose
sudo apt install docker-compose-plugin

# Перезагружаемся для применения изменений
sudo reboot
```

### 2. Настройка environment

```bash
# Копируем production конфигурацию
cp infrastructure/env.example .env

# Редактируем с production значениями
nano .env
```

Production переменные:
```env
NODE_ENV=production
BOT_TOKEN=your_production_bot_token

# Production БД (внешняя или контейнер)
DATABASE_URL=postgresql://user:secure_password@db:5432/tgbot_prod

# Production Redis
REDIS_URL=redis://redis:6379

# Безопасность
ADMIN_USERNAME=your_secure_admin_username

# Производительность
LOG_LEVEL=1  # Только критичные ошибки в production
```

### 3. Запуск production

```bash
# Запуск всей инфраструктуры
./start-infr.prod.bash

# Запуск приложения
./start-app.prod.bash

# Проверка статуса
docker ps
docker-compose -f infrastructure/docker-compose.production.yml logs -f app
```

### 4. Настройка автозапуска (systemd)

```bash
# Создаем systemd service
sudo nano /etc/systemd/system/tgbot.service
```

Содержимое service файла:
```ini
[Unit]
Description=Telegram Bot Altron
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=true
WorkingDirectory=/path/to/tgbot
ExecStart=/path/to/tgbot/start-app.prod.bash
ExecStop=/usr/bin/docker-compose -f infrastructure/docker-compose.production.yml down
User=your_user

[Install]
WantedBy=multi-user.target
```

```bash
# Активируем service
sudo systemctl enable tgbot.service
sudo systemctl start tgbot.service
```

## 🔧 Настройка внешних сервисов

### Telegram Bot

1. **Создание бота**:
   ```
   1. Откройте @BotFather в Telegram
   2. Отправьте /newbot
   3. Следуйте инструкциям
   4. Сохраните полученный токен
   ```

2. **Настройка команд** (опционально):
   ```
   /setcommands
   start - Запуск бота
   help - Помощь
   settings - Настройки чата
   ```

3. **Веб-приложение** (если используется):
   ```
   /setmenubutton
   Текст: "Админ панель"
   URL: https://yourdomain.com/admin
   ```

### AntiSpam API

Настройте внешний сервис анализа спама:

```bash
# Пример с собственным сервисом
cd infrastructure/services/antispam
docker build -t antispam-service .
docker run -d -p 8001:8000 antispam-service
```

### LLAMA API

Настройте LLM сервис:

```bash
cd infrastructure/services/llama
docker-compose up -d
```

## 📊 База данных

### Миграции

```bash
# Создание новой миграции
npm run db:generate

# Применение миграций
npm run db:migrate

# Откат миграции (осторожно!)
npm run db:rollback
```

### Резервное копирование

```bash
# Создание бэкапа
docker exec postgres pg_dump -U postgres tgbot > backup_$(date +%Y%m%d).sql

# Восстановление
docker exec -i postgres psql -U postgres tgbot < backup.sql
```

### Мониторинг БД

```sql
-- Проверка активных соединений
SELECT count(*) FROM pg_stat_activity;

-- Размер БД
SELECT pg_size_pretty(pg_database_size('tgbot'));

-- Активные запросы
SELECT query, state, query_start 
FROM pg_stat_activity 
WHERE state = 'active';
```

## 🧪 Тестирование

### Запуск тестов

```bash
# Все тесты
npm test

# Тесты с покрытием
npm run test:coverage

# Только unit тесты
npm run test:unit

# Только integration тесты
npm run test:integration

# Тесты в watch режиме
npm run test:watch
```

### Настройка тестовой БД

```bash
# Создание тестовой БД
createdb tgbot_test

# Переменная для тестов
export DATABASE_URL=postgresql://postgres:password@localhost:5432/tgbot_test
```

## 🌐 Веб-интерфейс

### Development

```bash
# Установка Fastify (если еще не установлен)
npm install fastify @fastify/cors @fastify/static

# Запуск с веб-интерфейсом
npm run dev
```

Веб-интерфейс доступен: http://localhost:3000/admin

### Production

```bash
# Настройка Nginx reverse proxy
sudo nano /etc/nginx/sites-available/tgbot
```

Конфигурация Nginx:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 📊 Мониторинг и логирование

### Логи

```bash
# Просмотр логов в реальном времени
tail -f app/logs/bot.log

# Docker logs
docker logs -f tgbot_app

# Логи конкретного сервиса
docker-compose logs -f postgres
```

### Health Check

```bash
# Проверка статуса всех сервисов
curl http://localhost:3000/api/health

# Ответ:
{
  "status": "ok",
  "services": {
    "database": true,
    "redis": true,
    "telegramBot": true,
    "aiChat": true
  }
}
```

### Метрики

```bash
# Статистика работы
curl http://localhost:3000/api/stats

# Redis статистика
docker exec redis redis-cli info stats
```

## 🛡️ Централизованная модерация и капча

Начиная с текущей версии, вся модерация вынесена в единый адаптер, а капча оркестрируется в одном сервисе.

- Где находится модерация:
  - `app/src/services/TelegramBot/adapters/ModerationAdapter.ts` — единый слой модерации (restrict/unrestrict/kick/ban/unban/delete/send).
  - Заменяет прежний `UserRestrictions` (удалён).

- Где находится капча:
  - Оркестрация: `app/src/services/CaptchaService/index.ts` (методы `startChallenge`, `submitAnswer`, обработка таймаута).
  - Telegram-адаптер: `app/src/services/TelegramBot/adapters/CaptchaTelegramAdapter.ts`.

- Настройка длительностей и таймаутов (runtime):
  - Управляются через `SettingsManager` у бота (см. `TelegramBotService`):
    - `temporaryBanDurationSec` — длительность временного бана.
    - `autoUnbanDelayMs` — задержка авторазбана/кика.
    - `captchaTimeoutMs`, `captchaCheckIntervalMs` — таймаут и период проверки капчи.
    - `errorMessageDeleteTimeoutMs` — автоудаление системных сообщений.
    - `maxMessagesForSpamCheck` — антиспам проверяет первые N сообщений.
  - Для быстрой настройки в dev: значения передаются в `Application.registerWebServices()` при создании `TelegramBotService` (параметр `botSettings`).

- Обязательные внешние сервисы для корректной работы модерации/капчи:
  - `REDIS_URL` — хранение счётчиков/кешей.
  - `ANTISPAM_URL` — внешний антиспам API (опционально, если используете антиспам).

После изменения настроек перезапустите приложение, либо добавьте свой API/команду для изменения `SettingsManager` на лету.

## 🔍 Устранение неполадок

### Частые проблемы

1. **Ошибка подключения к БД**:
   ```bash
   # Проверка соединения
   docker exec postgres pg_isready -U postgres
   
   # Проверка логов БД
   docker logs postgres
   ```

2. **Redis недоступен**:
   ```bash
   # Проверка Redis
   docker exec redis redis-cli ping
   # Должен ответить: PONG
   ```

3. **Telegram API ошибки**:
   ```bash
   # Проверка токена
   curl https://api.telegram.org/bot<YOUR_TOKEN>/getMe
   ```

4. **Нет ответов от AI**:
   - Проверьте, что API ключ добавлен через `/addAltronKey` команду
   - Убедитесь, что антиспам сервис доступен
   - Проверьте, что AI включен в чате (`/ultron 1`)
   - Проверьте логи AIChatService

### Диагностические команды

```bash
# Проверка всех сервисов
docker ps

# Использование ресурсов
docker stats

# Проверка портов
netstat -tlpn | grep :3000

# Проверка дискового пространства
df -h

# Проверка памяти
free -h
```

### Сброс и перезапуск

```bash
# Полная очистка (ОСТОРОЖНО! Удалит данные)
docker-compose down -v
docker system prune -a

# Пересборка контейнеров
docker-compose build --no-cache

# Перезапуск только приложения
docker-compose restart app
```

## 📞 Получение помощи

При возникновении проблем:

1. **Проверьте логи** - они содержат подробную информацию об ошибках
2. **Убедитесь в правильности .env** - все обязательные переменные должны быть заполнены  
3. **Проверьте доступность внешних сервисов** - антиспам, LLAMA API
4. **Создайте issue** с подробным описанием проблемы и логами

### Полезные ссылки

- [Документация Telegram Bot API](https://core.telegram.org/bots/api)
- [GramIO документация](https://gramio.dev)
- [Drizzle ORM](https://orm.drizzle.team)
- [Docker Compose](https://docs.docker.com/compose/) 