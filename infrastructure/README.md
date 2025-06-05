# 🚀 Telegram Bot Infrastructure

Production-ready Docker infrastructure for Telegram Bot with PostgreSQL and Redis.

## 📋 Quick Start

### 1. Setup Environment
```bash
# Copy environment example
cp env.example .env

# Edit environment variables
nano .env
```

### 2. Start Infrastructure
```bash
# Make scripts executable
chmod +x *.sh

# Start databases
./start.sh

# Or manually:
docker-compose up -d
```

### 3. Monitor Status
```bash
# Check status
./monitor.sh

# View logs
docker-compose logs -f postgres redis
```

## 🗂️ Project Structure

```
infrastructure/
├── docker-compose.yml              # Development configuration
├── docker-compose.production.yml   # Production configuration
├── env.example                     # Environment variables template
├── start.sh                       # Infrastructure startup script
├── stop.sh                        # Infrastructure shutdown script
├── monitor.sh                     # Infrastructure monitoring
├── backup.sh                      # Backup script
├── postgres/
│   ├── postgresql.conf            # PostgreSQL configuration
│   └── init/
│       └── 01-init.sql           # Database initialization
├── redis/
│   └── redis.conf                # Redis configuration
└── README.md                     # This file
```

## 🐳 Services

### PostgreSQL 15
- **Port**: 5432
- **Database**: tgbot
- **User**: postgres
- **Features**: JSONB support, pg_stat_statements, optimized for bot workload

### Redis 7
- **Port**: 6379
- **Features**: Memory optimization, persistence, TTL support

### Management Tools (Optional)
- **pgAdmin**: http://localhost:8080
- **Redis Commander**: http://localhost:8081

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_PASSWORD` | PostgreSQL password | `password` |
| `POSTGRES_USER` | PostgreSQL user | `postgres` |
| `POSTGRES_DB` | Database name | `tgbot` |
| `PGADMIN_EMAIL` | pgAdmin email | `admin@example.com` |
| `PGADMIN_PASSWORD` | pgAdmin password | `admin` |

### Connection Strings

#### From Docker Network
```bash
# PostgreSQL
DATABASE_URL=postgresql://postgres:password@postgres:5432/tgbot

# Redis
REDIS_URL=redis://redis:6379/0
```

#### From Host
```bash
# PostgreSQL
DATABASE_URL=postgresql://postgres:password@localhost:5432/tgbot

# Redis
REDIS_URL=redis://localhost:6379/0
```

## 📊 Monitoring

### Health Checks
```bash
# Automated monitoring
./monitor.sh

# Manual checks
docker exec tgbot-postgres pg_isready
docker exec tgbot-redis redis-cli ping
```

### Performance Metrics
- **PostgreSQL**: Connection count, database size, slow queries
- **Redis**: Memory usage, key count, hit ratio
- **Docker**: Resource usage, container status

## 💾 Backup & Restore

### Automatic Backup
```bash
# Run backup (PostgreSQL + Redis + configs)
./backup.sh

# Backups are stored in ./backups/
```

### Manual Backup
```bash
# PostgreSQL
docker exec tgbot-postgres pg_dump -U postgres tgbot > backup.sql

# Redis
docker exec tgbot-redis redis-cli BGSAVE
docker cp tgbot-redis:/data/dump.rdb ./redis_backup.rdb
```

### Restore
```bash
# PostgreSQL
cat backup.sql | docker exec -i tgbot-postgres psql -U postgres -d tgbot

# Redis
docker cp redis_backup.rdb tgbot-redis:/data/dump.rdb
docker restart tgbot-redis
```

## 🚀 Production Deployment

### 1. Production Configuration
```bash
# Use production compose file
docker-compose -f docker-compose.production.yml up -d

# With monitoring
docker-compose -f docker-compose.production.yml --profile monitoring up -d
```

### 2. Security Features
- SSL/TLS encryption
- Host-only port binding (127.0.0.1)
- Resource limits
- Health checks
- Logging configuration

### 3. Monitoring Stack (Optional)
- **Prometheus**: Metrics collection
- **Grafana**: Visualization dashboards
- **Exporters**: PostgreSQL and Redis metrics

## 🔍 Troubleshooting

### Common Issues

#### PostgreSQL Connection Issues
```bash
# Check PostgreSQL logs
docker logs tgbot-postgres

# Test connection
docker exec tgbot-postgres psql -U postgres -d tgbot -c "SELECT version();"
```

#### Redis Connection Issues
```bash
# Check Redis logs
docker logs tgbot-redis

# Test connection
docker exec tgbot-redis redis-cli info server
```

#### Network Issues
```bash
# Recreate network
docker network rm tgbot-network
docker network create tgbot-network
```

### Performance Tuning

#### PostgreSQL
- Adjust `shared_buffers` based on available memory
- Monitor slow queries with `pg_stat_statements`
- Optimize JSONB queries with GIN indexes

#### Redis
- Set appropriate `maxmemory` limit
- Use `allkeys-lru` eviction policy
- Monitor memory usage and hit ratio

## 📚 Commands Reference

### Docker Compose
```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# View logs
docker-compose logs -f [service]

# Scale services
docker-compose up -d --scale redis=2
```

### Database Access
```bash
# PostgreSQL shell
docker exec -it tgbot-postgres psql -U postgres -d tgbot

# Redis CLI
docker exec -it tgbot-redis redis-cli
```

### Maintenance
```bash
# PostgreSQL vacuum
docker exec tgbot-postgres psql -U postgres -d tgbot -c "VACUUM ANALYZE;"

# Redis memory optimization
docker exec tgbot-redis redis-cli MEMORY PURGE
```

## 🔒 Security Best Practices

1. **Change default passwords** in production
2. **Use strong passwords** (minimum 16 characters)
3. **Enable SSL/TLS** for external connections
4. **Restrict network access** (use host-only binding)
5. **Regular security updates** for Docker images
6. **Monitor logs** for suspicious activity
7. **Backup encryption** for sensitive data

## 📈 Performance Benchmarks

### Expected Performance
- **PostgreSQL**: < 10ms for simple queries
- **Redis**: < 1ms for cache operations
- **Docker overhead**: < 5% CPU/Memory

### Optimization Tips
- Use connection pooling
- Implement query result caching
- Monitor resource usage
- Regular maintenance tasks

## 🆘 Support

### Logs Location
- **PostgreSQL**: `docker logs tgbot-postgres`
- **Redis**: `docker logs tgbot-redis`
- **Docker Compose**: `docker-compose logs`

### Debug Mode
```bash
# Enable debug logging
docker-compose -f docker-compose.yml -f docker-compose.debug.yml up -d
```

### Resource Monitoring
```bash
# Real-time resource usage
docker stats tgbot-postgres tgbot-redis

# System resources
docker system df
docker system prune # Clean unused resources
``` 