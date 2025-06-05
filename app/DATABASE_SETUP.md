# 🗄️ Database Setup Guide

## Рекомендуемая архитектура БД для производительности

### 🎯 **Комбинированный подход: PostgreSQL + Redis**

- **PostgreSQL** - основная база данных для надежного хранения
- **Redis** - высокоскоростной кэш для частых операций

---

## 🐘 PostgreSQL Setup (Основная БД)

### **Зачем PostgreSQL?**
✅ **Excellent ACID compliance** - надежность данных  
✅ **JSONB поддержка** - гибкое хранение AI контекстов  
✅ **Мощные индексы** (включая GIN для JSON)  
✅ **Производительность** под высокой нагрузкой  
✅ **Зрелая экосистема** и ORM поддержка  

### **Installation**

#### Windows:
```bash
# Скачать с официального сайта
https://www.postgresql.org/download/windows/

# Или через Chocolatey
choco install postgresql

# Или через Scoop
scoop install postgresql
```

#### macOS:
```bash
# Homebrew
brew install postgresql
brew services start postgresql

# Создать базу данных
createdb tgbot
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib

# Запуск сервиса
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Создание пользователя и базы
sudo -u postgres createuser --interactive
sudo -u postgres createdb tgbot
```

#### Docker:
```bash
# Запуск PostgreSQL в Docker
docker run --name tgbot-postgres -e POSTGRES_PASSWORD=password -p 5432:5432 -d postgres:15

# Создание базы данных
docker exec -it tgbot-postgres createdb -U postgres tgbot
```

### **Configuration**

#### Connection String:
```env
DATABASE_URL=postgresql://username:password@localhost:5432/tgbot
```

#### Production Settings (`postgresql.conf`):
```conf
# Память
shared_buffers = 25% от RAM         # Например: 512MB для 2GB RAM
effective_cache_size = 75% от RAM   # Например: 1536MB для 2GB RAM
work_mem = 32MB                     # Для сложных запросов

# Производительность
random_page_cost = 1.1              # Для SSD
effective_io_concurrency = 200      # Для SSD

# Логирование медленных запросов
log_min_duration_statement = 1000   # Логировать запросы > 1 сек
log_statement = 'none'
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

---

## 🔄 Redis Setup (Кэш)

### **Зачем Redis?**
✅ **Суб-миллисекундная** скорость доступа  
✅ **Встроенный TTL** для автоочистки  
✅ **Pub/Sub** для real-time уведомлений  
✅ **Atomic операции** для счетчиков  

### **Installation**

#### Windows:
```bash
# Redis не поддерживает Windows официально, но есть форки:
# 1. Использовать WSL2 + Linux версию
# 2. Использовать Docker
docker run --name tgbot-redis -p 6379:6379 -d redis:7-alpine

# 3. Использовать Microsoft форк (устарел)
choco install redis-64
```

#### macOS:
```bash
# Homebrew
brew install redis
brew services start redis

# Тест подключения
redis-cli ping
```

#### Linux (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install redis-server

# Запуск сервиса
sudo systemctl start redis-server
sudo systemctl enable redis-server

# Тест подключения
redis-cli ping
```

#### Docker:
```bash
# Запуск Redis в Docker
docker run --name tgbot-redis -p 6379:6379 -d redis:7-alpine

# С persistence
docker run --name tgbot-redis -p 6379:6379 -v redis-data:/data -d redis:7-alpine redis-server --appendonly yes
```

### **Configuration**

#### Connection String:
```env
REDIS_URL=redis://localhost:6379/0
```

#### Production Settings (`redis.conf`):
```conf
# Память
maxmemory 512mb
maxmemory-policy allkeys-lru        # Удалять старые ключи при нехватке памяти

# Persistence (опционально)
save 900 1                          # Снапшот каждые 15 мин если >= 1 изменение
save 300 10                         # Снапшот каждые 5 мин если >= 10 изменений
save 60 10000                       # Снапшот каждую минуту если >= 10000 изменений

# Безопасность
bind 127.0.0.1                      # Слушать только localhost
requirepass your_strong_password     # Пароль

# Логи
loglevel notice
logfile /var/log/redis/redis-server.log
```

---

## 🔧 Database Schema

### **Drizzle ORM Commands**

```bash
# Генерация миграций
npm run db:generate

# Применение миграций
npm run db:migrate

# Просмотр БД в браузере
npm run db:studio

# Push схемы без миграций (dev)
npm run db:push
```

### **Схема таблиц**

```sql
-- Пользователи
users (id, username, first_name, message_count, is_restricted, ...)

-- Чаты и их настройки
chats (id, type, title, settings, is_active, ...)

-- AI контексты с JSONB
ai_contexts (chat_id, messages, daily_request_count, settings, ...)

-- Участники чатов
chat_members (chat_id, user_id, status, captcha_solved, ...)

-- Статистика бота
bot_stats (date, new_users, ai_requests, spam_detected, ...)

-- Лог событий
event_logs (id, event_type, chat_id, user_id, data, created_at, ...)
```

---

## 📊 Performance Optimization

### **PostgreSQL Indexes**
```sql
-- Автоматически создаются через Drizzle schema
CREATE INDEX idx_users_message_count ON users(message_count);
CREATE INDEX idx_ai_contexts_last_activity ON ai_contexts(last_activity);
CREATE INDEX idx_event_logs_event_type ON event_logs(event_type);
CREATE INDEX idx_event_logs_created_at ON event_logs(created_at);
```

### **Redis Key Structure**
```typescript
// Пользователи (TTL: 1 час)
"user:123456" = { id, username, messageCount, ... }

// Капча (TTL: 5 минут)  
"captcha:user:123456" = { chatId, questionId, answer, timestamp }

// Антиспам (TTL: 24 часа)
"antispam:user:123456" = { messageCount, isChecking, lastCheckTime }

// AI лимиты (TTL: до конца дня)
"ai:limit:123456:2024-01-15" = 42

// Очереди AI сообщений
"ai:queue:123456" = [message1, message2, ...]
```

---

## 🐳 Docker Compose Example

```yaml
version: '3.8'
services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: tgbot
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 30s
      timeout: 10s
      retries: 3

volumes:
  postgres_data:
  redis_data:
```

---

## 🔍 Monitoring & Health Checks

### **Database Health Endpoints**
- `GET /api/health/database` - PostgreSQL статус
- `GET /api/health/redis` - Redis статус  
- `GET /api/stats/database` - Статистика БД

### **Key Metrics to Monitor**

#### PostgreSQL:
- **Connection count** - активные подключения
- **Query latency** - время выполнения запросов
- **Database size** - размер базы данных
- **Slow queries** - медленные запросы

#### Redis:
- **Memory usage** - использование памяти
- **Hit ratio** - процент попаданий в кэш
- **Command latency** - время выполнения команд
- **Connection count** - активные подключения

### **Alerts Setup**
```bash
# PostgreSQL slow queries
log_min_duration_statement = 1000

# Redis memory usage > 80%
maxmemory-policy allkeys-lru

# Connection limits
max_connections = 100  # PostgreSQL
timeout 30            # Redis
```

---

## 🚀 Quick Start

1. **Установите PostgreSQL и Redis**
2. **Создайте базу данных:**
   ```bash
   createdb tgbot
   ```

3. **Настройте переменные окружения:**
   ```env
   DATABASE_URL=postgresql://postgres:password@localhost:5432/tgbot
   REDIS_URL=redis://localhost:6379/0
   ```

4. **Запустите миграции:**
   ```bash
   npm run db:migrate
   ```

5. **Запустите бота:**
   ```bash
   npm run dev
   ```

---

## 🎯 Production Checklist

- [ ] **PostgreSQL** настроен с production параметрами
- [ ] **Redis** настроен с LRU eviction policy  
- [ ] **Connection pooling** настроен (20 для PG, 10 для Redis)
- [ ] **Backup strategy** настроена для PostgreSQL
- [ ] **Monitoring** настроен для обеих БД
- [ ] **SSL/TLS** включен для production
- [ ] **Firewall rules** настроены
- [ ] **Health checks** работают корректно

**Эта архитектура обеспечивает оптимальный баланс производительности, надежности и масштабируемости для Telegram бота! 🚀** 