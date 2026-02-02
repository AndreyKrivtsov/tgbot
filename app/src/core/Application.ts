import type { Container } from "./Container.js"
import type { Logger } from "../helpers/Logger.js"
import type { AppConfig } from "../config.js"

/**
 * Оркестратор для регистрации и управления сервисами приложения
 */
export class Application {
  private container: Container
  private logger: Logger
  private config: AppConfig

  constructor(container: Container, logger: Logger, config: AppConfig) {
    this.container = container
    this.logger = logger
    this.config = config
  }

  private isSkipped(key: string): boolean {
    const envKey = `SKIP_${key.toUpperCase()}`
    const val = process.env[envKey]
    return val === "1" || val === "true"
  }

  /**
   * Инициализация всех сервисов приложения
   */
  async initialize(): Promise<void> {
    // Регистрируем основные сервисы
    await this.registerCoreServices()

    // Регистрируем сервисы инфраструктуры
    await this.registerInfrastructureServices()

    // Регистрируем бизнес-сервисы
    await this.registerBusinessServices()

    // Регистрируем веб-сервисы
    await this.registerWebServices()
  }

  /**
   * Запуск приложения
   */
  async start(): Promise<void> {
    // Запускаем все сервисы через контейнер
    await this.container.start()
  }

  /**
   * Остановка приложения
   */
  async stop(): Promise<void> {
    // Останавливаем все сервисы через контейнер
    await this.container.stop()
  }

  /**
   * Регистрация core сервисов
   */
  async registerCoreServices(): Promise<void> {
    // Message Provider
    if (!this.isSkipped("message_provider")) {
      this.container.register("messageProvider", async () => {
        const { createMessageProvider } = await import("../shared/messages/index.js")
        return createMessageProvider()
      })
    }

    // Database Service
    if (!this.isSkipped("db")) {
      this.container.register("database", async () => {
        const { DatabaseService } = await import("../services/DatabaseService/index.js")
        return new DatabaseService(this.config, this.logger)
      })
    }

    // Cache Service
    if (!this.isSkipped("cache")) {
      this.container.register("cache", async () => {
        const { CacheService } = await import("../services/CacheService/index.js")
        return new CacheService(this.config, this.logger)
      })
    }
  }

  /**
   * Регистрация infrastructure сервисов
   */
  async registerInfrastructureServices(): Promise<void> {
    // Redis Service
    if (!this.isSkipped("redis")) {
      this.container.register("redis", async () => {
        const { RedisService } = await import("../services/RedisService/index.js")
        return new RedisService(this.config, this.logger)
      })
    }
  }

  /**
   * Регистрация business сервисов
   */
  async registerBusinessServices(): Promise<void> {
    // EventBus - медиатор событий
    if (!this.isSkipped("eventbus")) {
      this.container.register("eventBus", async () => {
        const { EventBus } = await import("./EventBus.js")
        return new EventBus()
      })
    }

    // Chat Repository
    if (!this.isSkipped("chat_repository")) {
      this.container.register("chatRepository", async () => {
        const { ChatRepository } = await import("../repository/ChatRepository.js")
        const database = this.container.has("database") ? await this.container.getAsync("database") as any : undefined
        const cache = this.container.has("cache") ? await this.container.getAsync("cache") as any : undefined
        const redis = this.container.has("redis") ? await this.container.getAsync("redis") as any : undefined
        return new ChatRepository(database, cache, redis)
      })
    }

    // Captcha Service
    if (!this.isSkipped("captcha")) {
      this.container.register("captcha", async () => {
        const { CaptchaService } = await import("../services/CaptchaService/index.js")
        const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined

        // Настройки капчи (можно перенести в БД позже)
        const captchaSettings = {
          timeoutMs: 60000, // 60 секунд
          checkIntervalMs: 5000, // 5 секунд
        }

        // Не создаём адаптер и не запрашиваем telegramBot здесь, чтобы избежать цикла
        return new CaptchaService(this.config, this.logger, { eventBus }, captchaSettings)
      })
    }

    // Anti-Spam Service
    // if (!this.isSkipped("antispam")) {
    //   this.container.register("antiSpam", async () => {
    //     const { AntiSpamService } = await import("../services/AntiSpamService/index.js")
    //     const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined
    //     const redisService = this.container.has("redis") ? await this.container.getAsync("redis") as any : undefined

    //     // Настройки антиспама (можно перенести в БД позже)
    //     const antiSpamSettings = {
    //       timeoutMs: 5000, // 5 секунд
    //       maxRetries: 2, // 2 попытки
    //       retryDelayMs: 1000, // 1 секунда
    //     }

    //     return new AntiSpamService(this.config, this.logger, { eventBus, redisService }, antiSpamSettings)
    //   })
    // }

    if (!this.isSkipped("group_agent")) {
      this.container.register("groupAgent", async () => {
        const { GroupAgentService } = await import("../services/GroupAgentService/index.js")
        const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined
        const chatRepository = this.container.has("chatRepository") ? await this.container.getAsync("chatRepository") as any : undefined
        const redisService = this.container.has("redis") ? await this.container.getAsync("redis") as any : undefined

        return new GroupAgentService(this.config, {
          eventBus,
          chatRepository,
          redisService,
        })
      })
    }

    // Authorization Service
    if (!this.isSkipped("authorization")) {
      this.container.register("authorization", async () => {
        const { AuthorizationService } = await import("../services/AuthorizationService/index.js")
        const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined
        const chatRepository = this.container.has("chatRepository") ? await this.container.getAsync("chatRepository") as any : undefined
        return new AuthorizationService(this.config, this.logger, { eventBus, chatRepository })
      })
    }

    // Group Management Service (register/unregister)
    if (!this.isSkipped("group_management")) {
      this.container.register("groupManagement", async () => {
        const { GroupManagementService } = await import("../services/GroupManagementService/index.js")
        const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined
        const chatRepository = this.container.has("chatRepository") ? await this.container.getAsync("chatRepository") as any : undefined
        const authorizationService = this.container.has("authorization") ? await this.container.getAsync("authorization") as any : undefined
        const telegramBot = this.container.has("telegramBot") ? await this.container.getAsync("telegramBot") as any : undefined

        return new GroupManagementService(this.config, this.logger, {
          eventBus,
          chatRepository,
          authorizationService,
          telegramPort: telegramBot
            ? {
                getChatAdministrators: (chatId: number) => telegramBot.getChatAdministrators(chatId),
              }
            : undefined,
        })
      })
    }

    // Moderation Service (ban/mute)
    if (!this.isSkipped("moderation")) {
      this.container.register("moderation", async () => {
        const { ModerationService } = await import("../services/ModerationService/index.js")
        const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined
        const authorizationService = this.container.has("authorization") ? await this.container.getAsync("authorization") as any : undefined
        const telegramBot = this.container.has("telegramBot") ? await this.container.getAsync("telegramBot") as any : undefined

        return new ModerationService(this.config, this.logger, {
          eventBus,
          authorizationService,
          telegramPort: telegramBot
            ? {
                getChatMember: (params: { chat_id: number, user_id: number | string }) => telegramBot.getChatMember(params),
              }
            : undefined,
        })
      })
    }

    // Chat Configuration Service (ultron toggle, API key)
    if (!this.isSkipped("chat_configuration")) {
      this.container.register("chatConfiguration", async () => {
        const { ChatConfigurationService } = await import("../services/ChatConfigurationService/index.js")
        const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined
        const authorizationService = this.container.has("authorization") ? await this.container.getAsync("authorization") as any : undefined
        const chatRepository = this.container.has("chatRepository") ? await this.container.getAsync("chatRepository") as any : undefined
        const telegramBot = this.container.has("telegramBot") ? await this.container.getAsync("telegramBot") as any : undefined

        return new ChatConfigurationService(this.config, this.logger, {
          eventBus,
          authorizationService,
          chatRepository,
          telegramPort: telegramBot
            ? {
                getChat: (params: { chat_id: string }) => telegramBot.getChat(params as any),
              }
            : undefined,
        })
      })
    }
  }

  /**
   * Регистрация web сервисов
   */
  async registerWebServices(): Promise<void> {
    // Telegram Bot Service (с зависимостями)
    if (!this.isSkipped("telegram")) {
      this.container.register("telegramBot", async () => {
        const { TelegramBotService } = await import("../services/TelegramBot/index.js")
        const redisService = this.container.has("redis") ? await this.container.getAsync("redis") : undefined
        const captchaService = this.container.has("captcha") ? await this.container.getAsync("captcha") : undefined
        const antiSpamService = this.container.has("antiSpam") ? await this.container.getAsync("antiSpam") : undefined
        const chatRepository = this.container.has("chatRepository") ? await this.container.getAsync("chatRepository") : undefined
        const eventBus = this.container.has("eventBus") ? await this.container.getAsync("eventBus") as any : undefined

        // Настройки Telegram бота (можно перенести в БД позже)
        const botSettings = {
          captchaTimeoutMs: 60000, // 60 секунд
          captchaCheckIntervalMs: 5000, // 5 секунд
          errorMessageDeleteTimeoutMs: 60000, // 60 секунд
          deleteSystemMessages: true, // Удалять системные сообщения
          temporaryBanDurationSec: 40, // 40 секунд
          autoUnbanDelayMs: 5000, // 5 секунд
          maxMessagesForSpamCheck: 5, // Проверять антиспамом первые 5 сообщений
        }

        const botService = new TelegramBotService(this.config, this.logger, {
          redisService: redisService as any,
          captchaService: captchaService as any,
          antiSpamService: antiSpamService as any,
          chatRepository: chatRepository as any,
        }, botSettings)

      // Подключаем EventBus после инициализации TelegramBot (если он уже инициализирован)
      // Если нет — отложим подключение до конца initialize()
      ;(botService as any)._pendingEventBus = eventBus

        return botService
      })
    }

    // Web API Server Service
    if (!this.isSkipped("api")) {
      this.container.register("apiServer", async () => {
        const { WebApiService } = await import("../services/WebApiService/index.js")
        const database = this.container.has("database") ? await this.container.getAsync("database") : undefined
        const telegramBot = this.container.has("telegramBot") ? await this.container.getAsync("telegramBot") : undefined
        const groupManagement = this.container.has("groupManagement") ? await this.container.getAsync("groupManagement") as any : undefined
        const chatConfiguration = this.container.has("chatConfiguration") ? await this.container.getAsync("chatConfiguration") as any : undefined
        const authorization = this.container.has("authorization") ? await this.container.getAsync("authorization") as any : undefined
        const chatRepository = this.container.has("chatRepository") ? await this.container.getAsync("chatRepository") as any : undefined

        return new WebApiService(this.config, this.logger, {
          database,
          telegramBot,
          groupManagement,
          chatConfiguration,
          authorizationService: authorization,
          chatRepository,
        })
      })
    }
  }

  /**
   * Получение контейнера (для использования в других частях приложения)
   */
  getContainer(): Container {
    return this.container
  }
}
