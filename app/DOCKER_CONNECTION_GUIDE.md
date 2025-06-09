# 🔗 Подключение бота к Docker сервисам

## ✅ Готово!

Я создал файл `env.example` с правильными настройками подключения к Docker контейнерам.

## 📋 Пошаговое решение:

### 1. Скопируйте env.example в .env
```bash
cd app
cp env.example .env
```

### 2. Главные настройки подключения:
```bash
# PostgreSQL (Docker контейнер на хосте)
DATABASE_URL=postgresql://postgres:111111@localhost:5432/tgbot

# Redis (Docker контейнер на хосте)
REDIS_URL=redis://localhost:6379/0
```

### 3. Добавьте ваш токен бота:
```bash
BOT_TOKEN=your_actual_bot_token_here
```

## 🔍 Диагностика подключения:

### Проверка статуса контейнеров:
```bash
cd infrastructure
./monitor.sh
```

### Тест подключения к PostgreSQL:
```bash
# Изнутри контейнера
docker exec tgbot-postgres psql -U postgres -d tgbot -c "SELECT version();"

# С хоста (если установлен psql)
psql -h localhost -U postgres -d tgbot
```

### Тест подключения к Redis:
```bash
# Изнутри контейнера
docker exec tgbot-redis redis-cli ping

# С хоста (если установлен redis-cli)
redis-cli -h localhost ping
```

## ⚠️ Возможные проблемы и решения:

### 1. Порты заняты
Проверьте, что порты 5432 и 6379 не заняты другими процессами:
```bash
netstat -an | grep 5432
netstat -an | grep 6379
```

### 2. Windows Docker Desktop
Если используете Windows Docker Desktop, попробуйте:
```bash
DATABASE_URL=postgresql://postgres:111111@host.docker.internal:5432/tgbot
REDIS_URL=redis://host.docker.internal:6379/0
```

### 3. Альтернативные хосты
Попробуйте явно указать IP:
```bash
DATABASE_URL=postgresql://postgres:111111@127.0.0.1:5432/tgbot
REDIS_URL=redis://127.0.0.1:6379/0
```

### 4. Firewall/антивирус
Убедитесь, что ваш firewall или антивирус не блокирует соединения на эти порты.

## 🚀 Запуск после настройки:

```bash
cd app
npm run dev
```

## 📊 Логи для диагностики:

### Логи PostgreSQL:
```bash
docker logs tgbot-postgres
```

### Логи Redis:
```bash
docker logs tgbot-redis
```

### Логи бота:
```bash
# В директории app после запуска
tail -f bot.log
```

## 🎯 Текущий статус инфраструктуры:

✅ PostgreSQL: запущен и работает на порту 5432
✅ Redis: запущен и работает на порту 6379
✅ Контейнеры здоровы и принимают подключения

Проблема была в отсутствии `.env` файла с правильными настройками подключения! 