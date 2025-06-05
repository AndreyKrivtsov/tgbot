#!/bin/bash

# ==============================================
# TELEGRAM BOT INFRASTRUCTURE STARTUP SCRIPT
# ==============================================

set -e

echo "🚀 Starting Telegram Bot Infrastructure..."

# Проверка наличия .env файла
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found!"
    echo "📋 Please copy env.example to .env and configure it:"
    echo "   cp env.example .env"
    echo "   nano .env"
    exit 1
fi

# Создание сети если не существует
echo "🌐 Creating Docker network..."
docker network create tgbot-network 2>/dev/null || echo "📌 Network already exists"

# Запуск основных сервисов
echo "🗄️ Starting PostgreSQL and Redis..."
docker-compose up -d postgres redis

# Ожидание готовности PostgreSQL
echo "⏳ Waiting for PostgreSQL to be ready..."
timeout 60 bash -c 'until docker exec tgbot-postgres pg_isready -U postgres; do sleep 2; done'

# Ожидание готовности Redis
echo "⏳ Waiting for Redis to be ready..."
timeout 30 bash -c 'until docker exec tgbot-redis redis-cli ping | grep -q PONG; do sleep 2; done'

echo "✅ Infrastructure is ready!"
echo ""
echo "📊 Services status:"
docker-compose ps

echo ""
echo "🔗 Connection URLs:"
echo "   PostgreSQL: postgresql://postgres:[password]@localhost:5432/tgbot"
echo "   Redis: redis://localhost:6379/0"
echo ""
echo "🛠️ Optional tools (run with --profile tools):"
echo "   pgAdmin: http://localhost:8080"
echo "   Redis Commander: http://localhost:8081"
echo ""
echo "🎉 Ready to start your Telegram Bot!"

# Показать логи последних запущенных сервисов
echo ""
echo "📋 Recent logs:"
docker-compose logs --tail=10 