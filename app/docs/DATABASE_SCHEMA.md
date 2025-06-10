# 🗄️ Структура базы данных Telegram Bot

## 📋 Обзор

База данных состоит из 7 основных таблиц для управления пользователями, чатами, AI контекстами, статистикой и логами событий.

---

## 📊 Таблицы

### 1. **users** - Пользователи Telegram

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | bigint | Telegram user ID | PRIMARY KEY |
| `username` | varchar(255) | Имя пользователя в Telegram | NULL |
| `first_name` | varchar(255) | Имя пользователя | NULL |
| `last_name` | varchar(255) | Фамилия пользователя | NULL |
| `language_code` | varchar(10) | Код языка пользователя | NULL |
| `is_bot` | boolean | Является ли пользователь ботом | DEFAULT false |
| `is_restricted` | boolean | Ограничен ли пользователь | DEFAULT false |
| `restriction_reason` | text | Причина ограничения | NULL |
| `message_count` | integer | Количество сообщений | DEFAULT 0 |
| `created_at` | timestamp | Дата создания записи | DEFAULT NOW() |
| `updated_at` | timestamp | Дата последнего обновления | DEFAULT NOW() |

**Индексы:**
- `idx_users_username` на `username`
- `idx_users_created_at` на `created_at`
- `idx_users_message_count` на `message_count`

---

### 2. **chats** - Чаты с настройками ИИ

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | bigint | Telegram chat ID | PRIMARY KEY |
| `type` | varchar(50) | Тип чата (private, group, supergroup) | NOT NULL |
| `title` | varchar(255) | Название чата | NULL |
| `gemini_api_key` | varchar(512) | API ключ для Gemini | NULL |
| `system_prompt` | text | Системный промпт для AI | NULL |
| `is_ai_enabled` | boolean | Включен ли ИИ в группе | DEFAULT true |
| `daily_limit` | integer | Дневной лимит запросов к AI | DEFAULT 1500 |
| `throttle_delay` | integer | Задержка между запросами (мс) | DEFAULT 3000 |
| `max_context_characters` | integer | Максимальная длина контекста | DEFAULT 600 |
| `settings` | jsonb | Другие настройки бота | NULL |
| `is_active` | boolean | Активен ли чат | DEFAULT true |
| `created_at` | timestamp | Дата создания записи | DEFAULT NOW() |
| `updated_at` | timestamp | Дата последнего обновления | DEFAULT NOW() |

**Индексы:**
- `idx_chats_type` на `type`
- `idx_chats_active` на `is_active`
- `idx_chats_ai_enabled` на `is_ai_enabled`

---

### 3. **group_admins** - Администраторы групп

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `group_id` | bigint | ID группы | NOT NULL |
| `user_id` | bigint | ID пользователя | NOT NULL |
| `role` | varchar(50) | Роль (admin, owner, moderator) | DEFAULT 'admin' |
| `permissions` | jsonb | Разрешения администратора | NULL |
| `created_at` | timestamp | Дата создания записи | DEFAULT NOW() |

**Первичный ключ:** `(group_id, user_id)`

**Индексы:**
- `idx_group_admins_group` на `group_id`
- `idx_group_admins_user` на `user_id`
- `idx_group_admins_role` на `role`

---

### 4. **ai_contexts** - AI контексты чатов

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `chat_id` | bigint | ID чата | PRIMARY KEY |
| `messages` | text | История сообщений как единый текст | NULL |
| `total_request_count` | integer | Общее количество запросов | DEFAULT 0 |
| `daily_request_count` | integer | Количество запросов за день | DEFAULT 0 |
| `last_daily_reset` | date | Дата последнего сброса счетчика | DEFAULT NOW() |
| `last_activity` | timestamp | Последняя активность | DEFAULT NOW() |
| `context_length` | integer | Текущая длина контекста в символах | DEFAULT 0 |

**Индексы:**
- `idx_ai_contexts_last_activity` на `last_activity`
- `idx_ai_contexts_daily_reset` на `last_daily_reset`

---

### 5. **chat_members** - Участники чатов

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `chat_id` | bigint | ID чата | NOT NULL |
| `user_id` | bigint | ID пользователя | NOT NULL |
| `status` | varchar(50) | Статус (member, administrator, owner, left, kicked) | NOT NULL |
| `joined_at` | timestamp | Дата присоединения | DEFAULT NOW() |
| `left_at` | timestamp | Дата выхода | NULL |
| `captcha_solved` | boolean | Решена ли капча | DEFAULT false |
| `captcha_solved_at` | timestamp | Время решения капчи | NULL |

**Первичный ключ:** `(chat_id, user_id)`

**Индексы:**
- `idx_chat_members_status` на `status`
- `idx_chat_members_joined_at` на `joined_at`

---

### 6. **bot_stats** - Статистика работы бота

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `date` | date | Дата | PRIMARY KEY |
| `new_users` | integer | Новые пользователи | DEFAULT 0 |
| `messages_processed` | integer | Обработанные сообщения | DEFAULT 0 |
| `ai_requests` | integer | Запросы к AI | DEFAULT 0 |
| `spam_detected` | integer | Обнаруженный спам | DEFAULT 0 |
| `captcha_solved` | integer | Решенные капчи | DEFAULT 0 |
| `captcha_failed` | integer | Неудачные капчи | DEFAULT 0 |
| `captcha_timeout` | integer | Таймауты капчи | DEFAULT 0 |

**Индексы:**
- `idx_bot_stats_date` на `date`

---

### 7. **event_logs** - Лог важных событий

| Поле | Тип | Описание | Ограничения |
|------|-----|----------|-------------|
| `id` | bigint | Уникальный ID события | PRIMARY KEY (AUTO INCREMENT) |
| `event_type` | varchar(50) | Тип события | NOT NULL |
| `chat_id` | bigint | ID чата | NULL |
| `user_id` | bigint | ID пользователя | NULL |
| `data` | jsonb | Дополнительные данные события | NULL |
| `created_at` | timestamp | Дата создания события | DEFAULT NOW() |

**Индексы:**
- `idx_event_logs_event_type` на `event_type`
- `idx_event_logs_created_at` на `created_at`
- `idx_event_logs_chat_id` на `chat_id`
- `idx_event_logs_user_id` на `user_id`

---

## 🔗 Связи между таблицами

### Основные связи:
1. **users.id** ↔ **chat_members.user_id**
2. **chats.id** ↔ **chat_members.chat_id**
3. **chats.id** ↔ **ai_contexts.chat_id**
4. **chats.id** ↔ **group_admins.group_id**
5. **users.id** ↔ **group_admins.user_id**
6. **chats.id** ↔ **event_logs.chat_id**
7. **users.id** ↔ **event_logs.user_id**

### Референсные связи:
- `chat_members(chat_id)` → `chats(id)`
- `chat_members(user_id)` → `users(id)`
- `ai_contexts(chat_id)` → `chats(id)`
- `group_admins(group_id)` → `chats(id)`
- `group_admins(user_id)` → `users(id)`
- `event_logs(chat_id)` → `chats(id)` (опционально)
- `event_logs(user_id)` → `users(id)` (опционально)

---

## 📝 Примечания

### AI Функциональность:
- Каждый чат может иметь индивидуальный **API ключ Gemini**
- **Системный промпт** настраивается для каждой группы
- **Контекст ограничен 600 символами** по умолчанию
- **Дневные лимиты** и **задержки** настраиваются индивидуально

### Безопасность:
- **Администраторы групп** могут настраивать AI параметры
- **Логирование всех важных событий** в `event_logs`
- **Статистика** собирается ежедневно

### Производительность:
- **Индексы** оптимизированы для частых запросов
- **JSONB** поля для гибких настроек
- **Композитные первичные ключи** для связующих таблиц

---

## 🚀 Примеры типов событий (event_type):
- `user_joined` - пользователь присоединился
- `spam_detected` - обнаружен спам
- `ai_request` - запрос к AI
- `captcha_solved` - капча решена
- `captcha_failed` - капча не решена
- `admin_action` - действие администратора
- `settings_changed` - изменение настроек

---

*Документ создан: 2024-12-19*
*Версия схемы: 1.0*
