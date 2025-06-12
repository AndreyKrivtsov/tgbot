#!/bin/bash

# ==============================================
# TELEGRAM BOT INFRASTRUCTURE STOP SCRIPT
# ==============================================

set -e

echo "🛑 Stopping Telegram Bot Infrastructure..."

# Остановка всех сервисов
echo "📦 Stopping all containers..."
docker-compose down

echo "✅ Infrastructure stopped!"
echo ""
echo "💾 Data preserved in Docker volumes:"
echo "   - postgres_data (PostgreSQL data)"
echo "   - redis_data (Redis data)"
echo "   - pgadmin_data (pgAdmin settings)"
echo ""
echo "🗑️ To completely remove data, run:"
echo "   docker-compose down -v --remove-orphans" 