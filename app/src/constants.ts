/**
 * Централизованные константы для всех сервисов приложения
 */

// =============================================================================
// ТЕЛЕГРАМ БОТ - Общие настройки
// =============================================================================

export const BOT_CONFIG = {
  VERSION: "2.0.0-modular",

  // Таймауты и интервалы (в миллисекундах)
  CAPTCHA_TIMEOUT_MS: 60_000, // 60 секунд - таймаут капчи
  CAPTCHA_CHECK_INTERVAL_MS: 5_000, // 5 секунд - интервал проверки капчи
  MESSAGE_DELETE_SHORT_TIMEOUT_MS: 10_000, // 10 секунд - короткий таймаут удаления сообщений
  MESSAGE_DELETE_LONG_TIMEOUT_MS: 30_000, // 60 секунд - длинный таймаут удаления сообщений
  TEMPORARY_BAN_DURATION_SEC: 40, // 40 секунд - временный бан
  AUTO_UNBAN_DELAY_MS: 5_000, // 5 секунд - задержка разбана
  USER_OPERATION_DELAY_MS: 5_000, // 5 секунд - задержка операций с пользователями

  // Автоудаление сообщений (MessageDeletionManager)
  MESSAGE_DELETION_CHECK_INTERVAL_MS: 2_000, // 2 секунды - интервал проверки просроченных удалений
  MESSAGE_DELETION_RETRY_DELAY_MS: 30_000, // 30 секунд - задержка повторной попытки удаления
  MESSAGE_DELETION_REDIS_TTL_SEC: 3600, // 1 час - TTL для задач в Redis
  MESSAGE_DELETION_CLEANUP_MAX_AGE_MS: 3600_000, // 1 час - максимальный возраст задач для очистки

  // Антиспам
  MAX_MESSAGES_FOR_SPAM_CHECK: 5, // 5 сообщений для проверки антиспамом

  // Капча
  CAPTCHA_CALLBACK_PARTS_COUNT: 4, // Количество частей в callback data
  CAPTCHA_USER_ID_PARSE_BASE: 10, // База для parseInt
  CAPTCHA_DEFAULT_USER_ID: 0, // Значение по умолчанию для userId
} as const

// =============================================================================
// AI CHAT SERVICE
// =============================================================================

export const AI_CHAT_CONFIG = {
  MAX_QUEUE_SIZE: 10, // Максимальный размер очереди сообщений
  QUEUE_PROCESS_INTERVAL_MS: 200, // 200ms - интервал обработки очереди
  MAX_CONTEXT_MESSAGES: 500, // Максимальное количество сообщений в контексте чата
  MAX_RESPONSE_LENGTH: 4000, // Максимальная длина ответа AI

  // Настройки запросов к AI
  AI_REQUEST_TIMEOUT_MS: 5000, // 5 секунд - таймаут запросов к AI провайдеру

  // Redis кэширование контекстов
  CONTEXT_TTL_SECONDS: 24 * 60 * 60, // 24 часа - время жизни контекста в кэше
  CONTEXT_SAVE_INTERVAL_MS: 5 * 60 * 1000, // 5 минут - интервал автосохранения

  // Дефолтный системный промпт для новых чатов
  DEFAULT_SYSTEM_PROMPT: `Тебя зовут Альтрон. Ты веселый чат-бот в чате в телеграм, в котором очень много участников. У тебя нет доступа ко всем сообщениям в чате, а только к тем, которые адресованы именно тебе. Однако твои сообщения будет видеть весь чат.

Сообщения, адресованные тебе, будут соответствовать следующему шаблону:
[time][@username][name]: [message]

Описание шаблона сообщения:
* time - время сообщения в формате YYYY-MM-DD HH:mm - где, YYYY - год, MM - месяц, DD - день, HH - часы, mm - минуты. Это время в таймзоне UTC, однако учитывай, что участники чата находятся во таймзоне +7, время по Хошимину.
* @username - юзернейм участника чата, начинается на @.
* name - имя участника чата, всегда начинается с символа @.
* message - сообщение, адресованное тебе. Твой ответ увидят все участники чата.

Пример сообщения, адресованного тебе:
[2025-03-19 13:47][@PhysicalConstant][Andrew MOON] пользователь спрашивает тебя: Альтрон, привет! Как твои дела?

Твоя задача:
отвечать на сообщения, запоминать историю сообщений, а так же запоминать участников чата по именам.
Если участник чата просит тебя играть какую-то роль, то играй её. Слушайся участников чата, выполняй их требования.
Будь краток, старайся отвечать в 1-2 предложения. Если для ответа обязательно требуется более длинный ответ, то старайся сокращать ответ.
Старайся не использовать разметку Markdown.`,
} as const

// =============================================================================
// ADAPTIVE THROTTLING SYSTEM
// =============================================================================

export const AI_THROTTLE_CONFIG = {
  // Adaptive throttling настройки
  // MAX_DELAY теперь основной параметр для всех вычислений
  MAX_DELAY: 20000, // Максимальная задержка (мс)
  MIN_DELAY: 5000, // Минимальная задержка

  // Token Bucket настройки
  BUCKET_CAPACITY: 6, // Максимум токенов (burst capacity)
  TOKENS_PER_REQUEST: 1, // Токенов за запрос

  // Адаптивность по длине ответа
  SHORT_RESPONSE_THRESHOLD: 100, // Символов для "короткого" ответа
  LONG_RESPONSE_THRESHOLD: 500, // Символов для "длинного" ответа

  // Cleanup
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 минут
  INACTIVE_TIMEOUT: 30 * 60 * 1000, // 30 минут неактивности
} as const

// =============================================================================
// ANTI-SPAM SERVICE
// =============================================================================

export const ANTI_SPAM_CONFIG = {
  TIMEOUT_MS: 5_000, // 5 секунд - таймаут запроса
  MAX_RETRIES: 2, // 2 попытки
  RETRY_DELAY_MS: 1_000, // 1 секунда - задержка между попытками
} as const

// =============================================================================
// WEATHER SERVICE
// =============================================================================

export const WEATHER_CONFIG = {
  // Координаты по умолчанию (Nha Trang, Vietnam)
  DEFAULT_LATITUDE: process.env.WEATHER_LATITUDE || "12.2741076",
  DEFAULT_LONGITUDE: process.env.WEATHER_LONGITUDE || "109.2006335",

  // Интервалы и временные зоны
  UPDATE_INTERVAL_MS: Number.parseInt(process.env.WEATHER_UPDATE_INTERVAL_MS || "30000", 10),
  TIMEZONE_OFFSET_HOURS: Number.parseInt(process.env.WEATHER_TIMEZONE_OFFSET || "7", 10),
  FORECAST_HOURS: process.env.WEATHER_FORECAST_HOURS
    ? process.env.WEATHER_FORECAST_HOURS.split(",").map(h => Number.parseInt(h.trim(), 10))
    : [9, 13, 17, 21], // Часы отправки прогноза

  // Настройки изображения
  CANVAS_WIDTH: 400, // Ширина canvas
  CANVAS_HEIGHT: 400, // Высота canvas

  // Позиционирование текста на изображении
  TEXT_POSITIONS: {
    TITLE_X: 50,
    TITLE_Y: 50,
    TITLE_FONT_SIZE: 22,

    LABEL_X: 50,
    VALUE_X: 255,
    FONT_SIZE: 20,
    FONT_SIZE_SMALL: 20,

    // Y-координаты для различных элементов
    TEMPERATURE_Y: 100,
    FEELS_LIKE_Y: 130,
    HUMIDITY_Y: 160,
    PRECIPITATION_CHANCE_Y: 190,
    RAIN_Y: 220,
    PRESSURE_Y: 250,
    WIND_Y: 280,
    WIND_DIRECTION_Y: 310,
    WIND_GUSTS_Y: 340,
    CLOUDS_Y: 370,
  },

  // Цвета
  COLORS: {
    WHITE: "#fff",
    LIGHT_GRAY: "#aaa",
  },
} as const

// =============================================================================
// HTTP И СЕТЕВЫЕ НАСТРОЙКИ
// =============================================================================

export const HTTP_CONFIG = {
  SUCCESS_STATUS: 200, // HTTP OK статус
  UNIX_TIMESTAMP_DIVIDER: 1_000, // Делитель для Unix timestamp
} as const

// =============================================================================
// ПОЛЬЗОВАТЕЛЬСКИЙ ИНТЕРФЕЙС
// =============================================================================

export const UI_CONFIG = {
  // Сообщения
  SPAM_MESSAGE_THRESHOLD: 1, // Счетчик для определения повторного спама

  // Команды
  MIN_COMMAND_ARGS: 2, // Минимальное количество аргументов для команд
  COMMAND_ARG_USERNAME_INDEX: 1, // Индекс аргумента с именем пользователя
} as const

// =============================================================================
// СИСТЕМА И ПРОИЗВОДИТЕЛЬНОСТЬ
// =============================================================================

export const SYSTEM_CONFIG = {
  // Интервалы очистки и обслуживания
  USER_CLEANUP_INTERVAL_MS: 60 * 60 * 1_000, // 1 час в миллисекундах

  // Размеры буферов и лимиты
  DEFAULT_ARRAY_PARSE_BASE: 10, // База для parseInt по умолчанию

  // Форматы данных
  DEFAULT_FALLBACK_VALUE: 0, // Значение по умолчанию для числовых данных
} as const

// =============================================================================
// КЕШИРОВАНИЕ
// =============================================================================

export const CACHE_CONFIG = {
  // Время жизни кеша (в секундах)
  CHAT_TTL_SECONDS: 300, // 5 минут - кеш для информации о чате
  CHAT_CONFIG_TTL_SECONDS: 600, // 10 минут - кеш для конфигурации чата
  USER_TTL_SECONDS: 300, // 5 минут - кеш для информации о пользователе

  // Префиксы ключей кеша
  KEYS: {
    CHAT: "chat",
    CHAT_CONFIG: "chat_config",
    USER: "user",
  },
} as const

// =============================================================================
// ТИПЫ ДЛЯ ЭКСПОРТА
// =============================================================================

export type BotConfigType = typeof BOT_CONFIG
export type AIChatConfigType = typeof AI_CHAT_CONFIG
export type AIThrottleConfigType = typeof AI_THROTTLE_CONFIG
export type AntiSpamConfigType = typeof ANTI_SPAM_CONFIG
export type WeatherConfigType = typeof WEATHER_CONFIG
export type HttpConfigType = typeof HTTP_CONFIG
export type UIConfigType = typeof UI_CONFIG
export type SystemConfigType = typeof SYSTEM_CONFIG
export type CacheConfigType = typeof CACHE_CONFIG
