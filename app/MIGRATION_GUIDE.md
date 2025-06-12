# 🔄 Руководство по миграции базы данных

## 📋 Обзор

Данная миграция упрощает схему базы данных, оставляя только 2 основные таблицы:
- `chats` - чаты с настройками ИИ
- `group_admins` - администраторы групп

## ⚠️ ВНИМАНИЕ

**Эта миграция полностью удаляет все существующие данные!**
Убедитесь, что у вас есть резервная копия, если данные важны.

## 🚀 Применение миграции

### Вариант 1: Автоматическая миграция через Drizzle

```bash
# 1. Убедитесь, что DATABASE_URL настроен в .env файле
cp env.example .env
# Отредактируйте .env файл, установив правильный DATABASE_URL

# 2. Примените миграцию
npm run db:migrate
```

### Вариант 2: Ручное применение SQL скрипта

```bash
# 1. Подключитесь к PostgreSQL
psql -h localhost -U postgres -d tgbot

# 2. Выполните скрипт очистки и миграции
\i drizzle/cleanup_and_migrate.sql

# 3. Проверьте результат
\dt
```

### Вариант 3: Полная пересборка через Docker

```bash
# 1. Остановите контейнеры
docker-compose down

# 2. Удалите том с данными PostgreSQL
docker volume rm tgbot_postgres_data

# 3. Запустите контейнеры заново
docker-compose up -d

# 4. Примените миграцию
npm run db:migrate
```

## 📊 Новая структура

### Таблица `chats`
```sql
- id (bigint) - Telegram chat ID
- type (varchar) - тип чата
- title (varchar) - название чата
- gemini_api_key (varchar) - API ключ для Gemini
- ai_enabled (boolean) - включен ли ИИ
- throttle_delay (integer) - задержка между запросами
- active (boolean) - активен ли чат
- created_at (timestamp) - дата создания
- updated_at (timestamp) - дата обновления
```

### Таблица `group_admins`
```sql
- group_id (bigint) - ID группы
- user_id (bigint) - ID пользователя
- created_at (timestamp) - дата создания
```

## ✅ Проверка миграции

После применения миграции проверьте:

```sql
-- Проверить созданные таблицы
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public';

-- Проверить структуру таблицы chats
\d chats

-- Проверить структуру таблицы group_admins
\d group_admins

-- Проверить индексы
SELECT indexname, tablename FROM pg_indexes
WHERE schemaname = 'public';
```

## 🔧 Откат миграции

Если нужно вернуть старую схему, восстановите из резервной копии:

```bash
# Восстановление из дампа
pg_restore -h localhost -U postgres -d tgbot backup.dump
```

## 📝 Изменения в коде

Обновлены следующие файлы:
- `src/db/schema.ts` - новая упрощенная схема
- `src/repository/ChatAiRepository.ts` - обновлены методы
- `docs/DATABASE_SCHEMA.md` - обновлена документация

## 🎯 Следующие шаги

1. Обновите код приложения для работы с новой схемой
2. Протестируйте основные функции бота
3. При необходимости добавьте недостающие поля в будущих миграциях
