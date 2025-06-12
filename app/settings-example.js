/**
 * Пример использования настроек TelegramBotService и CaptchaService
 *
 * Этот файл демонстрирует, как можно настраивать таймауты и другие параметры
 * для последующего переноса в базу данных
 */

// Пример настроек для TelegramBotService
const telegramBotSettings = {
  // Настройки капчи
  captchaTimeoutMs: 90000, // 90 секунд вместо 60 по умолчанию
  captchaCheckIntervalMs: 3000, // Проверка каждые 3 секунды вместо 5

  // Настройки сообщений
  errorMessageDeleteTimeoutMs: 120000, // Удалять сообщения об ошибках через 2 минуты
  deleteSystemMessages: true, // Удалять системные сообщения о входе/выходе

  // Настройки банов
  temporaryBanDurationSec: 60, // Временный бан на 60 секунд вместо 40
  autoUnbanDelayMs: 10000, // Автоматический разбан через 10 секунд

  // Настройки антиспама
  maxMessagesForSpamCheck: 10, // Проверять антиспамом первые 10 сообщений вместо 5
}

// Пример настроек для CaptchaService
const captchaSettings = {
  timeoutMs: 90000, // 90 секунд на прохождение капчи
  checkIntervalMs: 3000, // Проверка истекших капч каждые 3 секунды
}

// Пример настроек для AntiSpamService
const antiSpamSettings = {
  timeoutMs: 3000, // Таймаут запроса к API (3 секунды)
  maxRetries: 3, // Максимум 3 попытки вместо 2
  retryDelayMs: 2000, // Задержка между попытками 2 секунды
}

// Пример использования в коде:
/*
// При создании TelegramBotService
const telegramBot = new TelegramBotService(config, logger, dependencies, telegramBotSettings)

// При создании CaptchaService
const captchaService = new CaptchaService(config, logger, dependencies, captchaSettings)

// При создании AntiSpamService
const antiSpamService = new AntiSpamService(config, logger, dependencies, antiSpamSettings)

// Обновление настроек во время работы
telegramBot.updateSettings({
  errorMessageDeleteTimeoutMs: 180000  // Изменить на 3 минуты
})

// Получение текущих настроек
const currentSettings = telegramBot.getSettings()
console.log('Текущие настройки:', currentSettings)

// В будущем - загрузка из БД
await telegramBot.loadSettingsFromDatabase()

// В будущем - сохранение в БД
await telegramBot.saveSettingsToDatabase()
*/

module.exports = {
  telegramBotSettings,
  captchaSettings,
  antiSpamSettings,
}
