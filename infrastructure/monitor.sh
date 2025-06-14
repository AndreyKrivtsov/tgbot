#!/bin/bash

# ==============================================
# TELEGRAM BOT INFRASTRUCTURE MONITORING
# ==============================================

set -e

echo "📊 Telegram Bot Infrastructure Status"
echo "===================================="

# Проверка статуса контейнеров
echo ""
echo "🐳 Docker Containers:"
docker-compose ps

# Проверка использования ресурсов
echo ""
echo "💾 Resource Usage:"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" tgbot-postgres tgbot-redis 2>/dev/null || echo "❌ Containers not running"

# Проверка здоровья PostgreSQL
echo ""
echo "🐘 PostgreSQL Health:"
if docker exec tgbot-postgres pg_isready -U postgres >/dev/null 2>&1; then
    echo "✅ PostgreSQL is healthy"
    
    # Статистика подключений
    CONNECTIONS=$(docker exec tgbot-postgres psql -U postgres -d tgbot -t -c "SELECT count(*) FROM pg_stat_activity WHERE datname='tgbot';" 2>/dev/null | xargs)
    echo "   Active connections: $CONNECTIONS"
    
    # Размер базы данных
    DB_SIZE=$(docker exec tgbot-postgres psql -U postgres -d tgbot -t -c "SELECT pg_size_pretty(pg_database_size('tgbot'));" 2>/dev/null | xargs)
    echo "   Database size: $DB_SIZE"
    
    # Медленные запросы (если есть pg_stat_statements)
    SLOW_QUERIES=$(docker exec tgbot-postgres psql -U postgres -d tgbot -t -c "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000;" 2>/dev/null | xargs || echo "N/A")
    echo "   Slow queries (>1s): $SLOW_QUERIES"
else
    echo "❌ PostgreSQL is not healthy"
fi

# Проверка здоровья Redis
echo ""
echo "🔄 Redis Health:"
if docker exec app-redis-prod redis-cli ping | grep -q PONG 2>/dev/null; then
    echo "✅ Redis is healthy"
    
    # Информация о памяти
    REDIS_MEMORY=$(docker exec app-redis-prod redis-cli info memory | grep used_memory_human | cut -d: -f2 | tr -d '\r')
    echo "   Memory usage: $REDIS_MEMORY"
    
    # Количество ключей
    REDIS_KEYS=$(docker exec app-redis-prod redis-cli dbsize 2>/dev/null)
    echo "   Total keys: $REDIS_KEYS"
    
    # Hit ratio
    HITS=$(docker exec app-redis-prod redis-cli info stats | grep keyspace_hits | cut -d: -f2 | tr -d '\r')
    MISSES=$(docker exec app-redis-prod redis-cli info stats | grep keyspace_misses | cut -d: -f2 | tr -d '\r')
    if [ "$HITS" != "" ] && [ "$MISSES" != "" ] && [ $((HITS + MISSES)) -gt 0 ]; then
        HIT_RATIO=$(echo "scale=2; $HITS * 100 / ($HITS + $MISSES)" | bc -l 2>/dev/null || echo "N/A")
        echo "   Hit ratio: $HIT_RATIO%"
    else
        echo "   Hit ratio: N/A"
    fi
else
    echo "❌ Redis is not healthy"
fi

# Проверка сети
echo ""
echo "🌐 Network Status:"
NETWORK_EXISTS=$(docker network ls | grep app-network-prod | wc -l)
if [ "$NETWORK_EXISTS" -eq 1 ]; then
    echo "✅ app-network-prod exists"
else
    echo "❌ app-network-prod not found"
fi

# Проверка томов
echo ""
echo "💾 Volume Status:"
docker volume ls | grep -E "(postgres_data|redis_data|pgadmin_data)" || echo "❌ No volumes found"

# Последние логи
echo ""
echo "📋 Recent Logs (last 5 lines):"
echo "PostgreSQL:"
docker-compose logs --tail=5 postgres 2>/dev/null | sed 's/^/   /' || echo "   No logs available"
echo "Redis:"
docker-compose logs --tail=5 app-redis-prod 2>/dev/null | sed 's/^/   /' || echo "   No logs available"
echo "App:"
docker-compose logs --tail=5 app 2>/dev/null | sed 's/^/   /' || echo "   No logs available"

echo ""
echo "🔗 Quick Commands:"
echo "   View logs: docker-compose logs -f [service]"
echo "   Connect to PostgreSQL: docker exec -it tgbot-postgres psql -U postgres -d tgbot"
echo "   Connect to Redis: docker exec -it app-redis-prod redis-cli"
echo "   Connect to App: docker exec -it app sh"
echo "   pgAdmin: http://localhost:8080"
echo "   Redis Commander: http://localhost:8081 (if tools profile is running)" 