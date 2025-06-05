#!/bin/bash

# ==============================================
# TELEGRAM BOT BACKUP SCRIPT
# ==============================================

set -e

BACKUP_DIR="./backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo "💾 Starting backup process..."

# Создание директории для бэкапов
mkdir -p "$BACKUP_DIR"

# PostgreSQL Backup
echo "🐘 Backing up PostgreSQL..."
if docker exec tgbot-postgres pg_isready -U postgres >/dev/null 2>&1; then
    docker exec tgbot-postgres pg_dump -U postgres -d tgbot | gzip > "$BACKUP_DIR/postgres_tgbot_$TIMESTAMP.sql.gz"
    echo "✅ PostgreSQL backup saved: postgres_tgbot_$TIMESTAMP.sql.gz"
else
    echo "❌ PostgreSQL is not running, skipping backup"
fi

# Redis Backup
echo "🔄 Backing up Redis..."
if docker exec tgbot-redis redis-cli ping | grep -q PONG 2>/dev/null; then
    # Создание снапшота
    docker exec tgbot-redis redis-cli BGSAVE
    
    # Ожидание завершения снапшота
    echo "⏳ Waiting for Redis background save to complete..."
    while docker exec tgbot-redis redis-cli LASTSAVE | grep -q $(docker exec tgbot-redis redis-cli LASTSAVE) 2>/dev/null; do
        sleep 1
    done
    
    # Копирование файла дампа
    docker cp tgbot-redis:/data/dump.rdb "$BACKUP_DIR/redis_dump_$TIMESTAMP.rdb"
    gzip "$BACKUP_DIR/redis_dump_$TIMESTAMP.rdb"
    echo "✅ Redis backup saved: redis_dump_$TIMESTAMP.rdb.gz"
else
    echo "❌ Redis is not running, skipping backup"
fi

# Создание архива конфигураций
echo "📋 Backing up configurations..."
tar -czf "$BACKUP_DIR/configs_$TIMESTAMP.tar.gz" \
    docker-compose.yml \
    postgres/postgresql.conf \
    postgres/init/ \
    redis/redis.conf \
    env.example \
    *.sh 2>/dev/null || true

echo "✅ Configuration backup saved: configs_$TIMESTAMP.tar.gz"

# Очистка старых бэкапов (старше 7 дней)
echo "🧹 Cleaning up old backups..."
find "$BACKUP_DIR" -type f -mtime +7 -name "*.gz" -delete 2>/dev/null || true
find "$BACKUP_DIR" -type f -mtime +7 -name "*.tar.gz" -delete 2>/dev/null || true

echo ""
echo "📊 Backup Summary:"
ls -lh "$BACKUP_DIR"/*$TIMESTAMP* 2>/dev/null || echo "No backups created"

echo ""
echo "✅ Backup process completed!"
echo "📁 Backups location: $BACKUP_DIR"
echo ""
echo "🔄 To restore:"
echo "   PostgreSQL: gunzip -c postgres_tgbot_TIMESTAMP.sql.gz | docker exec -i tgbot-postgres psql -U postgres -d tgbot"
echo "   Redis: docker cp redis_dump_TIMESTAMP.rdb tgbot-redis:/data/dump.rdb && docker restart tgbot-redis" 