-- ==============================================
-- POSTGRESQL INITIALIZATION SCRIPT
-- ==============================================

-- Создание расширений для оптимальной работы
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

-- Создание пользователя для приложения (если нужно)
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'tgbot_user') THEN
        CREATE USER tgbot_user WITH PASSWORD 'tgbot_password';
        GRANT CONNECT ON DATABASE tgbot TO tgbot_user;
        GRANT USAGE ON SCHEMA public TO tgbot_user;
        GRANT CREATE ON SCHEMA public TO tgbot_user;
    END IF;
END
$$;

-- Настройка прав доступа
GRANT ALL PRIVILEGES ON DATABASE tgbot TO tgbot_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tgbot_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tgbot_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO tgbot_user;

-- Установка часового пояса
SET timezone = 'UTC';

-- Оптимизация для JSONB (важно для AI контекстов)
ALTER DATABASE tgbot SET timezone = 'UTC';
ALTER DATABASE tgbot SET log_statement = 'all';
ALTER DATABASE tgbot SET log_min_duration_statement = 1000;

-- Создание схемы для статистики (опционально)
CREATE SCHEMA IF NOT EXISTS analytics;
GRANT USAGE ON SCHEMA analytics TO tgbot_user;
GRANT CREATE ON SCHEMA analytics TO tgbot_user; 