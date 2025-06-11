import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBotDependencies, TelegramBotSettings } from "../types/index.js"
import { BOT_CONFIG } from "../../../constants.js"

/**
 * Менеджер настроек для Telegram бота
 */
export class SettingsManager {
  private settings: TelegramBotSettings
  private logger: Logger
  private dependencies: TelegramBotDependencies

  constructor(
    initialSettings: Partial<TelegramBotSettings>,
    logger: Logger,
    dependencies: TelegramBotDependencies = {},
  ) {
    this.logger = logger
    this.dependencies = dependencies

    // Настройки по умолчанию
    this.settings = {
      captchaTimeoutMs: BOT_CONFIG.CAPTCHA_TIMEOUT_MS,
      captchaCheckIntervalMs: BOT_CONFIG.CAPTCHA_CHECK_INTERVAL_MS,
      errorMessageDeleteTimeoutMs: BOT_CONFIG.ERROR_MESSAGE_DELETE_TIMEOUT_MS,
      deleteSystemMessages: true, // Удалять системные сообщения
      temporaryBanDurationSec: BOT_CONFIG.TEMPORARY_BAN_DURATION_SEC,
      autoUnbanDelayMs: BOT_CONFIG.AUTO_UNBAN_DELAY_MS,
      maxMessagesForSpamCheck: BOT_CONFIG.MAX_MESSAGES_FOR_SPAM_CHECK,
      ...initialSettings,
    }
  }

  /**
   * Получение текущих настроек
   */
  getSettings(): TelegramBotSettings {
    return { ...this.settings }
  }

  /**
   * Обновление настроек
   */
  updateSettings(newSettings: Partial<TelegramBotSettings>): void {
    this.settings = { ...this.settings, ...newSettings }
    this.logger.i("📝 Telegram bot settings updated")

    // Передаем настройки капчи в CaptchaService
    if (this.dependencies.captchaService
      && (newSettings.captchaTimeoutMs !== undefined || newSettings.captchaCheckIntervalMs !== undefined)) {
      const captchaSettings: any = {}
      if (newSettings.captchaTimeoutMs !== undefined) {
        captchaSettings.timeoutMs = newSettings.captchaTimeoutMs
      }
      if (newSettings.captchaCheckIntervalMs !== undefined) {
        captchaSettings.checkIntervalMs = newSettings.captchaCheckIntervalMs
      }

      // Если CaptchaService поддерживает updateSettings
      if (typeof (this.dependencies.captchaService as any).updateSettings === "function") {
        (this.dependencies.captchaService as any).updateSettings(captchaSettings)
      }
    }
  }

  /**
   * Загрузка настроек из базы данных (для будущего использования)
   */
  async loadSettingsFromDatabase(): Promise<void> {
    try {
      // TODO: Реализовать загрузку настроек из БД
      // const settings = await this.dependencies.repository?.getSettings?.()
      // if (settings) {
      //   this.updateSettings(settings)
      // }
      this.logger.i("Settings loading from database is not implemented yet")
    } catch (error) {
      this.logger.e("❌ Error loading settings from database:", error)
    }
  }

  /**
   * Сохранение настроек в базу данных (для будущего использования)
   */
  async saveSettingsToDatabase(): Promise<void> {
    try {
      // TODO: Реализовать сохранение настроек в БД
      // await this.dependencies.repository?.saveSettings?.(this.settings)
      this.logger.i("Settings saving to database is not implemented yet")
    } catch (error) {
      this.logger.e("❌ Error saving settings to database:", error)
    }
  }

  /**
   * Получить значение конкретной настройки
   */
  getSetting<K extends keyof TelegramBotSettings>(key: K): TelegramBotSettings[K] {
    return this.settings[key]
  }

  /**
   * Установить значение конкретной настройки
   */
  setSetting<K extends keyof TelegramBotSettings>(key: K, value: TelegramBotSettings[K]): void {
    this.settings[key] = value
    this.logger.i(`Setting ${key} updated to ${value}`)
  }

  /**
   * Сброс настроек к значениям по умолчанию
   */
  resetToDefault(): void {
    this.settings = {
      captchaTimeoutMs: BOT_CONFIG.CAPTCHA_TIMEOUT_MS,
      captchaCheckIntervalMs: BOT_CONFIG.CAPTCHA_CHECK_INTERVAL_MS,
      errorMessageDeleteTimeoutMs: BOT_CONFIG.ERROR_MESSAGE_DELETE_TIMEOUT_MS,
      deleteSystemMessages: true,
      temporaryBanDurationSec: BOT_CONFIG.TEMPORARY_BAN_DURATION_SEC,
      autoUnbanDelayMs: BOT_CONFIG.AUTO_UNBAN_DELAY_MS,
      maxMessagesForSpamCheck: BOT_CONFIG.MAX_MESSAGES_FOR_SPAM_CHECK,
    }
    this.logger.i("Settings reset to default values")
  }

  /**
   * Валидация настроек
   */
  validateSettings(): boolean {
    // Валидация удалена по запросу
    return true
  }
}
