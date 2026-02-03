import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { TelegramBotService } from "../index.js"
import { getMessage } from "../../../shared/messages/index.js"
import type { BotContext, TelegramMessageContext } from "../types/index.js"
import type { EventBus } from "../../../core/EventBus.js"
import { EVENTS } from "../../../core/EventBus.js"

/**
 * Обработчик команд Telegram бота
 */
export class CommandHandler {
  private logger: Logger
  private config: AppConfig
  private chatRepository: ChatRepository
  private botService: TelegramBotService
  private bot: any
  private eventBus?: EventBus

  constructor(
    logger: Logger,
    config: AppConfig,
    userRestrictions: any,
    chatRepository: ChatRepository,
    botService: TelegramBotService,
    eventBus?: EventBus,
  ) {
    this.logger = logger
    this.config = config
    this.chatRepository = chatRepository
    this.botService = botService
    this.bot = botService.getBot()
    this.eventBus = eventBus
  }

  /**
   * Удаление сообщения пользователя с командой
   * По умолчанию удаляет только в группах, но можно принудительно удалить и в приватных чатах
   */
  private async deleteUserCommandMessage(context: TelegramMessageContext, forceDeleteInPrivate = false): Promise<void> {
    try {
      // Удаляем сообщение пользователя с командой
      // В группах (chatId < 0) - всегда удаляем
      // В приватных чатах (chatId > 0) - только если forceDeleteInPrivate = true
      if (context.chat && context.id) {
        const shouldDelete = context.chat.id < 0 || forceDeleteInPrivate

        if (shouldDelete) {
          await this.bot.deleteMessage(context.chat.id, context.id)
          this.logger.d(`Deleted user command message ${context.id} in chat ${context.chat.id}`)
        }
      }
    } catch (error) {
      this.logger.w("Failed to delete user command message:", error)
      // Не прерываем выполнение, если не удалось удалить сообщение
    }
  }

  /**
   * Обработка команды /start
   */
  async handleStartCommand(context: BotContext): Promise<void> {
    try {
      // Удаляем сообщение пользователя с командой
      await this.deleteUserCommandMessage(context as TelegramMessageContext)

      const message = getMessage("welcome")
      await this.bot.sendGroupMessage({ chat_id: context.chat!.id, text: message })
    } catch (error) {
      this.logger.e("Error handling start command:", error)
      const errorMessage = getMessage("command_start_error")
      await this.bot.sendGroupMessage({ chat_id: context.chat!.id, text: errorMessage })
    }
  }

  /**
   * Основной обработчик команд
   *
   * Поддерживает следующие форматы команд:
   * - /register - общая команда
   * - /register@test_ai_group_bot - команда, адресованная конкретному боту
   *
   * @example
   * // Обе команды будут обработаны, если наш бот @test_ai_group_bot:
   * "/register" - обработается
   * "/register@test_ai_group_bot" - обработается
   * "/register@another_bot" - будет проигнорирована
   */
  async handleCommand(context: TelegramMessageContext): Promise<void> {
    const text = context.text
    if (!text) {
      return
    }

    try {
      // Парсим команду
      const parsed = this.parseCommand(text)
      if (!parsed) {
        return
      }

      const { command, targetBotUsername } = parsed

      // Получаем информацию о боте из кеша
      const botInfo = await this.botService.getBotInfo()
      const botUsername = botInfo?.username

      // Проверяем, адресована ли команда нашему боту
      const isForOurBot = await this.isCommandForOurBot(targetBotUsername, botUsername)
      if (!isForOurBot) {
        this.logger.d(`Command ${command} targeted to @${targetBotUsername}, but our bot is @${botUsername} - ignoring`)
        return
      }

      // Обрабатываем команду
      // Эмитим доменную команду для сервисов (без изменения текущей логики)
      await this.emitDomainCommand(command, context)

      switch (command) {
        case "/start":
          await this.handleStartCommand(context)
          break
        case "/help":
          await this.handleHelpCommand(context)
          break
        case "/register":
        case "/unregister":
          // Логика перенесена в GroupManagementService через EventBus
          break
        case "/ban":
        case "/unban":
        case "/mute":
        case "/unmute":
          // Логика перенесена в ModerationService через EventBus
          break
        case "/clearhistory":
          // Логика перенесена в GroupAgentService через EventBus
          break
        case "/addaltronkey":
        case "/ultron":
          // Логика перенесена в ChatConfigurationService через EventBus
          break
        default:
          // Неизвестная команда - игнорируем
          break
      }
    } catch (error) {
      this.logger.e("Error in command handler:", error)
    }
  }

  private async emitDomainCommand(command: string, context: TelegramMessageContext): Promise<void> {
    if (!this.eventBus) {
      return
    }

    const actorId = context.from?.id
    const chatId = context.chat?.id
    const messageId = context.id
    if (!actorId || !chatId) {
      return
    }

    const parts = (context.text || "").trim().split(/\s+/)

    switch (command) {
      case "/register":
        await this.eventBus.emit(EVENTS.COMMAND_REGISTER, {
          actorId,
          chatId,
          messageId,
          actorUsername: context.from?.username,
          chatTitle: context.chat?.title,
        })
        break
      case "/unregister":
        await this.eventBus.emit(EVENTS.COMMAND_UNREGISTER, {
          actorId,
          chatId,
          messageId,
          actorUsername: context.from?.username,
        })
        break
      case "/ban": {
        const arg = parts[1]
        const target = this.buildTarget(arg, context)
        await this.eventBus.emit(EVENTS.COMMAND_BAN, {
          actorId,
          chatId,
          messageId,
          target,
          actorUsername: context.from?.username,
        })
        break
      }
      case "/unban": {
        const arg = parts[1]
        const target = this.buildTarget(arg, context)
        await this.eventBus.emit(EVENTS.COMMAND_UNBAN, {
          actorId,
          chatId,
          messageId,
          target,
          actorUsername: context.from?.username,
        })
        break
      }
      case "/mute": {
        const arg = parts[1]
        const target = this.buildTarget(arg, context)
        await this.eventBus.emit(EVENTS.COMMAND_MUTE, {
          actorId,
          chatId,
          messageId,
          target,
          actorUsername: context.from?.username,
        })
        break
      }
      case "/unmute": {
        const arg = parts[1]
        const target = this.buildTarget(arg, context)
        await this.eventBus.emit(EVENTS.COMMAND_UNMUTE, {
          actorId,
          chatId,
          messageId,
          target,
          actorUsername: context.from?.username,
        })
        break
      }
      case "/ultron": {
        // /ultron [@chat_username] 1|0  OR  /ultron 1|0
        const enabledToken = parts.length === 2 ? parts[1] : parts[2]
        const enabled = enabledToken === "1"
        const targetChat = parts.length === 3 ? { username: (parts[1] || "").replace("@", "") } : undefined
        await this.eventBus.emit(EVENTS.COMMAND_ULTRON_TOGGLE, {
          actorId,
          chatId,
          messageId,
          targetChat,
          enabled,
          actorUsername: context.from?.username,
        })
        break
      }
      case "/addaltronkey": {
        // /addAltronKey @chat_username API_KEY (в приватном чате)
        const username = (parts[1] || "").replace("@", "")
        const apiKey = parts[2]
        if (username && apiKey) {
          await this.eventBus.emit(EVENTS.COMMAND_ADD_ALTRON_KEY, {
            actorId,
            chatId,
            messageId,
            targetChat: { username },
            apiKey,
            actorUsername: context.from?.username,
          })
        }
        break
      }
      case "/clearhistory": {
        const rawTarget = parts[1]
        const targetProvided = Boolean(rawTarget)
        let targetChatId: number | undefined
        if (rawTarget) {
          const asNumber = Number(rawTarget)
          if (Number.isInteger(asNumber) && String(asNumber) === rawTarget) {
            targetChatId = asNumber
          }
        }

        await this.eventBus.emit(EVENTS.COMMAND_CLEAR_HISTORY, {
          actorId,
          chatId,
          messageId,
          targetChatId,
          targetProvided,
          actorUsername: context.from?.username,
        })
        break
      }
      default:
        break
    }
  }

  private buildTarget(arg: string | undefined, context: TelegramMessageContext): { userId?: number, username?: string } {
    if (context.replyMessage?.from?.id) {
      return { userId: context.replyMessage.from.id, username: context.replyMessage.from.username }
    }
    if (arg) {
      const cleaned = arg.replace("@", "")
      const asNumber = Number(cleaned)
      if (!Number.isNaN(asNumber) && cleaned === String(asNumber)) {
        return { userId: asNumber }
      }
      return { username: cleaned }
    }
    return {}
  }

  /**
   * Обработка команды /help
   */
  async handleHelpCommand(context: BotContext): Promise<void> {
    try {
      // Удаляем сообщение пользователя с командой
      await this.deleteUserCommandMessage(context as TelegramMessageContext)

      const message = getMessage("help")
      await this.bot.sendGroupMessage({ chat_id: context.chat!.id, text: message })
    } catch (error) {
      this.logger.e("Error handling help command:", error)
      const errorMessage = getMessage("help_command_error")
      await this.bot.sendGroupMessage({ chat_id: context.chat!.id, text: errorMessage })
    }
  }

  /**
   * Парсинг команды с поддержкой адресации к конкретному боту
   */
  private parseCommand(text: string): { command: string, targetBotUsername?: string } | null {
    const commandParts = text.split(" ")[0]?.split("@")
    if (!commandParts || commandParts.length === 0) {
      return null
    }

    const command = commandParts[0]?.toLowerCase()
    const targetBotUsername = commandParts[1] // может быть undefined

    if (!command) {
      return null
    }

    return {
      command,
      targetBotUsername,
    }
  }

  /**
   * Проверка, адресована ли команда нашему боту
   */
  private async isCommandForOurBot(targetBotUsername?: string, botUsername?: string): Promise<boolean> {
    // Если команда без @username, то она общая - обрабатываем
    if (!targetBotUsername) {
      return true
    }

    // Если нет информации о нашем боте, то не можем проверить
    if (!botUsername) {
      this.logger.w("Bot username not available from cache, cannot verify targeted command")
      return false
    }

    // Проверяем, что команда адресована именно нашему боту
    return targetBotUsername === botUsername
  }
}
