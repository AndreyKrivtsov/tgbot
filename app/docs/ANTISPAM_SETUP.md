# 🛡️ AntiSpam Service Setup

## 📋 Описание

AntiSpam сервис на Python/FastAPI для проверки сообщений на спам. Теперь доступен как изнутри Docker сети, так и снаружи с localhost.

## 🚀 Запуск

### Вариант 1: Через основную инфраструктуру (рекомендуется)

```bash
# Из корня проекта
cd infrastructure
docker-compose up -d antispam
```

### Вариант 2: Отдельно (старый способ)

```bash
# Из директории antispam  
cd antispam
docker-compose up -d
```

## 🔧 Настройки

### Для приложения внутри Docker:
```env
ANTISPAM_URL=http://antispam:6323
```

### Для тестирования с localhost:
```env
ANTISPAM_URL=http://localhost:6323
```

## 📡 Доступ

- **Внутри Docker**: `http://antispam:6323`
- **Снаружи (localhost)**: `http://localhost:6323`
- **API документация**: `http://localhost:6323/docs`

## 🧪 Тестирование

### Curl запрос:
```bash
curl -X POST "http://localhost:6323/" \
  -H "Content-Type: application/json" \
  -d '{"text": "Тестовое сообщение"}'
```

### Ожидаемый ответ:
```json
{
  "is_spam": false
}
```

### Тест спам сообщения:
```bash
curl -X POST "http://localhost:6323/" \
  -H "Content-Type: application/json" \
  -d '{"text": "Приветствую! Стабильный доход, от 570 долларов в неделю, всё официально. Пишите старт в личные."}'
```

## 🐛 Отладка

### Проверка статуса:
```bash
docker-compose ps antispam
```

### Логи:
```bash
docker-compose logs -f antispam
```

### Проверка сети:
```bash
docker network ls
docker network inspect infrastructure_tgbot-network
```

## 🔄 Перезапуск

```bash
# Пересборка и перезапуск
docker-compose up -d --build antispam

# Только перезапуск
docker-compose restart antispam
```

## ⚡ Быстрый старт

1. **Запустить антиспам сервис:**
   ```bash
   cd infrastructure
   docker-compose up -d antispam
   ```

2. **Проверить работу:**
   ```bash
   curl http://localhost:6323/docs
   ```

3. **Настроить в боте:**
   ```env
   # В .env файле
   ANTISPAM_URL=http://antispam:6323  # Для Docker
   # или
   ANTISPAM_URL=http://localhost:6323  # Для разработки
   ```

4. **Запустить бота:**
   ```bash
   cd app
   npm start
   ```

## 📊 Мониторинг

Health check endpoint: `http://localhost:6323/docs`

Автоматические проверки каждые 30 секунд через Docker health check. 