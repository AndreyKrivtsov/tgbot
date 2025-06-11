import type { IService } from "../../../core/Container.js"
import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { BotContext, TelegramMessageContext } from "../types/index.js"
import { MessageFormatter } from "../utils/MessageFormatter.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"
import type { UserManager } from "../features/UserManager.js"
import type { ChatAiRepository } from "../../../repository/ChatAiRepository.js"
import type { TelegramBotService } from "../index.js"
import type { AIChatService } from "../../AIChatService/index.js"

/**
 * Обработчик команд Telegram бота
 */
export class CommandHandler {
  private logger: Logger
  private config: AppConfig
  private userRestrictions: UserRestrictions
  private userManager: UserManager
  private chatRepository: ChatAiRepository
  private botService: TelegramBotService
  private aiChatService?: AIChatService

  constructor(
    logger: Logger,
    config: AppConfig,
    userRestrictions: UserRestrictions,
    userManager: UserManager,
    chatRepository: ChatAiRepository,
    botService: TelegramBotService,
    aiChatService?: AIChatService,
  ) {
    this.logger = logger
    this.config = config
    this.userRestrictions = userRestrictions
    this.userManager = userManager
    this.chatRepository = chatRepository
    this.botService = botService
    this.aiChatService = aiChatService
  }

  /**
   * Обработка команды /start
   */
  async handleStartCommand(context: BotContext): Promise<void> {
    try {
      const message = MessageFormatter.formatWelcomeMessage()
      await this.userRestrictions.sendMessage(context.chat!.id, message)
      this.logger.i(`Start command handled for chat ${context.chat!.id}`)
    } catch (error) {
      this.logger.e("Error handling start command:", error)
      const errorMessage = MessageFormatter.formatErrorMessage("Не удалось выполнить команду /start")
      await this.userRestrictions.sendMessage(context.chat!.id, errorMessage)
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

      // Логируем обработку команды
      if (targetBotUsername) {
        this.logger.d(`Processing targeted command: ${command}@${targetBotUsername}`)
      } else {
        this.logger.d(`Processing general command: ${command}`)
      }

      // Обрабатываем команду
      this.logger.d(`Handling command: "${command}"`)
      switch (command) {
        case "/start":
          await this.handleStartCommand(context)
          break
        case "/help":
          await this.handleHelpCommand(context)
          break
        case "/register":
          await this.handleRegisterCommand(context)
          break
        case "/unregister":
          await this.handleUnregisterCommand(context)
          break
        case "/ban":
          await this.handleBanCommand(context)
          break
        case "/unban":
          await this.handleUnbanCommand(context)
          break
        case "/mute":
          await this.handleMuteCommand(context)
          break
        case "/unmute":
          await this.handleUnmuteCommand(context)
          break
        case "/addaltronkey":
          await this.handleAddAltronKeyCommand(context)
          break
        default:
          // Неизвестная команда - игнорируем
          break
      }
    } catch (error) {
      this.logger.e("Error in command handler:", error)
    }
  }

  /**
   * Обработка команды /help
   */
  async handleHelpCommand(context: BotContext): Promise<void> {
    try {
      const message = MessageFormatter.formatHelpText()
      await this.userRestrictions.sendMessage(context.chat!.id, message)
      this.logger.i(`Help command handled for chat ${context.chat!.id}`)
    } catch (error) {
      this.logger.e("Error handling help command:", error)
    }
  }

  /**
   * Обработка команды бана
   */
  async handleBanCommand(context: any): Promise<void> {
    if (!this.isAdminCommand(context)) {
      return
    }

    const chatId = context.chat?.id
    if (!chatId) {
      this.logger.w("No chat ID in ban command")
      return
    }

    try {
      const args = (context.text || "").split(" ")
      if (args.length < 2) {
        await this.userRestrictions.sendMessage(chatId, "Использование: /ban @username или /ban (ответ на сообщение)")
        return
      }

      let targetUserId: number | null = null
      let targetUsername = "неизвестный"

      // Проверяем, есть ли reply на сообщение
      if (context.replyMessage?.from) {
        targetUserId = context.replyMessage.from.id
        targetUsername = context.replyMessage.from.first_name || context.replyMessage.from.username || "неизвестный"
      } else if (args[1]) {
        // Пытаемся извлечь username из аргумента
        const username = args[1].replace("@", "")
        targetUsername = username

        // В реальном боте здесь нужно найти пользователя по username
        // Пока просто выводим ошибку
        await this.userRestrictions.sendMessage(chatId, `⚠️ Не удалось найти пользователя @${username}. Используйте reply на сообщение пользователя.`)
        return
      } else {
        await this.userRestrictions.sendMessage(chatId, "Укажите пользователя для бана или ответьте на его сообщение")
        return
      }

      if (targetUserId) {
        // Баним пользователя
        await this.userRestrictions.kickUserFromChat(chatId, targetUserId, targetUsername)
        await this.userRestrictions.sendMessage(chatId, `✅ Пользователь ${targetUsername} забанен`)

        this.logger.i(`👤 Admin ${context.from?.first_name || context.from?.username} banned user ${targetUsername} (${targetUserId})`)
      }
    } catch (error) {
      this.logger.e("Error handling ban command:", error)
      await this.userRestrictions.sendMessage(chatId, "❌ Ошибка при выполнении команды бана")
    }
  }

  /**
   * Обработка команды /unban
   */
  async handleUnbanCommand(context: BotContext): Promise<void> {
    const chatId = context.chat?.id

    if (!chatId) {
      return
    }

    try {
      const isAdmin = context.from?.username === this.config.ADMIN_USERNAME?.replace("@", "")

      if (!isAdmin) {
        const errorMessage = MessageFormatter.formatErrorMessage("У вас нет прав для использования этой команды.")
        await this.userRestrictions.sendMessage(chatId, errorMessage)
        return
      }

      // Пока что показываем справку по команде
      const message = "🔹 `/unban @user` - разбанить пользователя"
      await this.userRestrictions.sendMessage(chatId, message)
    } catch (error) {
      this.logger.e("Error in unban command:", error)
    }
  }

  /**
   * Обработка команды /mute
   */
  async handleMuteCommand(context: BotContext): Promise<void> {
    const chatId = context.chat?.id

    if (!chatId) {
      return
    }

    try {
      const isAdmin = context.from?.username === this.config.ADMIN_USERNAME?.replace("@", "")

      if (!isAdmin) {
        const errorMessage = MessageFormatter.formatErrorMessage("У вас нет прав для использования этой команды.")
        await this.userRestrictions.sendMessage(chatId, errorMessage)
        return
      }

      // Пока что показываем справку по команде
      const message = "🔹 `/mute @user` - заглушить пользователя"
      await this.userRestrictions.sendMessage(chatId, message)
    } catch (error) {
      this.logger.e("Error in mute command:", error)
    }
  }

  /**
   * Обработка команды /unmute
   */
  async handleUnmuteCommand(context: BotContext): Promise<void> {
    const chatId = context.chat?.id

    if (!chatId) {
      return
    }

    try {
      const isAdmin = context.from?.username === this.config.ADMIN_USERNAME?.replace("@", "")

      if (!isAdmin) {
        const errorMessage = MessageFormatter.formatErrorMessage("У вас нет прав для использования этой команды.")
        await this.userRestrictions.sendMessage(chatId, errorMessage)
        return
      }

      // Пока что показываем справку по команде
      const message = "🔹 `/unmute @user` - снять заглушение"
      await this.userRestrictions.sendMessage(chatId, message)
    } catch (error) {
      this.logger.e("Error in unmute command:", error)
    }
  }

  /**
   * Обработка команды /addAltronKey (добавление API ключа для группы)
   * Формат: /addAltronKey @chat_username API_KEY
   */
  async handleAddAltronKeyCommand(context: TelegramMessageContext): Promise<void> {
    console.log("handleAddAltronKeyCommand", context)
    const chat = context.chat
    const userId = context.from?.id

    if (!chat || !userId) {
      return
    }

    // Команда работает только в приватном чате с ботом
    if (chat.id < 0) {
      await this.userRestrictions.sendMessage(chat.id, "❌ Эта команда работает только в приватном чате с ботом")
      return
    }

    try {
      const args = (context.text || "").split(" ")
      if (args.length < 3) {
        const helpMessage = "📝 Использование: `/addAltronKey @chat_username API_KEY`\n\n"
          + "Где:\n"
          + "• `@chat_username` - юзернейм группы\n"
          + "• `API_KEY` - ваш API ключ для Altron AI"
        await this.userRestrictions.sendMessage(chat.id, helpMessage)
        return
      }

      const chatUsername = args[1]?.replace("@", "")
      const apiKey = args[2]

      if (!chatUsername || !apiKey) {
        await this.userRestrictions.sendMessage(chat.id, "❌ Неверный формат команды")
        return
      }

      // Валидация API ключа (базовая проверка)
      if (apiKey.length < 10) {
        await this.userRestrictions.sendMessage(chat.id, "❌ API ключ слишком короткий")
        return
      }

      // Ищем чат по username в базе данных
      const targetChat = await this.findChatByUsername(chatUsername)
      if (!targetChat) {
        // Получаем список доступных групп для администратора
        const availableChats = await this.getAvailableChatsForUser(userId)
        
        let notFoundMessage = `❌ Группа @${chatUsername} не найдена в базе данных\n\n`
          + "💡 Убедитесь что:\n"
          + "• Бот добавлен в группу @" + chatUsername + "\n"
          + "• Группа зарегистрирована командой /register\n"
          + "• Вы являетесь администратором этой группы"
          
        if (availableChats.length > 0) {
          notFoundMessage += "\n\n📋 Доступные группы, где вы администратор:\n"
            + availableChats.map(chat => `• ${chat.title || 'Без названия'} (ID: ${chat.id})`).join("\n")
        }
        
        await this.userRestrictions.sendMessage(chat.id, notFoundMessage)
        return
      }

      // Проверяем является ли пользователь администратором этой группы
      const isAdmin = await this.chatRepository.isAdmin(targetChat.id, userId)
      if (!isAdmin) {
        const noPermissionMessage = `❌ Вы не являетесь администратором группы "${targetChat.title || chatUsername}"\n\n`
          + "Только администраторы группы могут добавлять API ключи."
        await this.userRestrictions.sendMessage(chat.id, noPermissionMessage)
        return
      }

      // Добавляем API ключ в настройки группы
      this.logger.i(`🔑 [SAVE] Attempting to save API key for chat ${targetChat.id} (${targetChat.title})`)
      const success = await this.chatRepository.updateChatConfig(targetChat.id, {
        geminiApiKey: apiKey,
      })
      this.logger.i(`🔑 [SAVE] Save result for chat ${targetChat.id}: ${success}`)

      if (success) {
        // Проверяем, что API ключ действительно сохранен
        const savedConfig = await this.chatRepository.getChatConfig(targetChat.id)
        this.logger.i(`🔑 [VERIFY] Saved config for chat ${targetChat.id}: ${JSON.stringify({
          exists: !!savedConfig,
          hasApiKey: !!savedConfig?.geminiApiKey,
          apiKeyPreview: savedConfig?.geminiApiKey ? `${savedConfig.geminiApiKey.substring(0, 12)}...${savedConfig.geminiApiKey.slice(-4)}` : null,
        })}`)

        // Очищаем кэш в AIChatService, чтобы он загрузил свежие данные
        this.logger.i(`🔄 [CACHE] Clearing AIChatService cache for chat ${targetChat.id}`)
        if (this.aiChatService) {
          this.aiChatService.clearChatCache(targetChat.id)
          this.logger.i(`🔄 [CACHE] Cache cleared successfully for chat ${targetChat.id}`)
        } else {
          this.logger.w(`🔄 [CACHE] No AIChatService available to clear cache for chat ${targetChat.id}`)
        }

        const successMessage = `✅ API ключ успешно добавлен для группы "${targetChat.title || chatUsername}"\n\n🤖 Теперь группа может использовать собственный AI API ключ`
        await this.userRestrictions.sendMessage(chat.id, successMessage)
        
        this.logger.i(`Admin ${userId} added API key for chat ${targetChat.id} (${targetChat.title})`)
      } else {
        await this.userRestrictions.sendMessage(chat.id, "❌ Не удалось сохранить API ключ. Попробуйте позже.")
        this.logger.e(`Failed to update API key for chat ${targetChat.id} by user ${userId}`)
      }

    } catch (error) {
      this.logger.e("Error handling addAltronKey command:", error)
      await this.userRestrictions.sendMessage(chat.id, "❌ Произошла ошибка при обработке команды")
    }
  }

  /**
   * Поиск чата по username
   */
  private async findChatByUsername(username: string): Promise<{ id: number, title?: string } | null> {
    try {
      // Сначала пытаемся получить информацию о чате через Telegram API
      try {
        const chatInfo = await this.botService.getBotApi().getChat({
          chat_id: `@${username}`,
        })

        if (chatInfo && chatInfo.id) {
          // Проверяем, есть ли этот чат в нашей базе данных
          const existingChat = await this.chatRepository.getChat(chatInfo.id)
          if (existingChat && existingChat.active) {
            return { 
              id: chatInfo.id, 
              title: chatInfo.title || chatInfo.first_name || username,
            }
          }
        }
      } catch (apiError) {
        this.logger.d(`Telegram API couldn't find chat @${username}:`, apiError)
      }

      // Fallback: ищем по title в базе данных
      const chats = await this.chatRepository.getActiveAiChats()
      
      for (const chat of chats) {
        // Простой поиск по вхождению username в title
        if (chat.title?.toLowerCase().includes(username.toLowerCase())) {
          return { id: chat.id, title: chat.title }
        }
      }
      
      return null
    } catch (error) {
      this.logger.e("Error finding chat by username:", error)
      return null
    }
  }

  /**
   * Получить список групп, где пользователь является администратором
   */
  private async getAvailableChatsForUser(userId: number): Promise<Array<{ id: number, title?: string }>> {
    try {
      const chats = await this.chatRepository.getActiveAiChats()
      const availableChats: Array<{ id: number, title?: string }> = []
      
      for (const chat of chats) {
        const isAdmin = await this.chatRepository.isAdmin(chat.id, userId)
        if (isAdmin) {
          availableChats.push({ id: chat.id, title: chat.title || undefined })
        }
      }
      
      return availableChats
    } catch (error) {
      this.logger.e("Error getting available chats for user:", error)
      return []
    }
  }

  /**
   * Обработка команды /register (регистрация группы)
   */
  async handleRegisterCommand(context: TelegramMessageContext): Promise<void> {
    const chat = context.chat
    const userId = context.from?.id

    if (!chat || !chat.id || !userId) {
      return
    }

    // Команда работает только в группах
    if (chat.id > 0) {
      await this.userRestrictions.sendMessage(chat.id, "❌ Эта команда работает только в группах")
      return
    }

    try {
      const result = await this.registerChat(chat.id, userId, chat.title, chat.type)
      if (result.success) {
        await this.userRestrictions.sendMessage(chat.id, "✅ Группа успешно зарегистрирована в боте!")
        this.logger.i(`User ${userId} registered chat ${chat.id}`)
      } else {
        await this.userRestrictions.sendMessage(chat.id, `❌ ${result.message}`)
      }
    } catch (error) {
      this.logger.e("Error handling register command:", error)
      await this.userRestrictions.sendMessage(chat.id, "❌ Ошибка при регистрации группы")
    }
  }

  /**
   * Обработка команды /unregister (разрегистрация группы)
   */
  async handleUnregisterCommand(context: TelegramMessageContext): Promise<void> {
    const chat = context.chat
    const userId = context.from?.id

    if (!chat || !chat.id || !userId) {
      return
    }

    // Команда работает только в группах
    if (chat.id > 0) {
      await this.userRestrictions.sendMessage(chat.id, "❌ Эта команда работает только в группах")
      return
    }

    try {
      const result = await this.unregisterChat(chat.id, userId)
      if (result.success) {
        await this.userRestrictions.sendMessage(chat.id, "✅ Группа успешно исключена из бота!")
        this.logger.i(`User ${userId} unregistered chat ${chat.id}`)
      } else {
        await this.userRestrictions.sendMessage(chat.id, `❌ ${result.message}`)
      }
    } catch (error) {
      this.logger.e("Error handling unregister command:", error)
      await this.userRestrictions.sendMessage(chat.id, "❌ Ошибка при разрегистрации группы")
    }
  }

  /**
   * Регистрация чата в боте
   */
  private async registerChat(chatId: number, userId: number, chatTitle?: string, chatType?: string): Promise<{ success: boolean, message?: string }> {
    // Проверяем, есть ли уже чат в базе
    const existingChat = await this.chatRepository.getChat(chatId)

    if (existingChat) {
      // Если чат существует и активен - сообщаем что уже зарегистрирован
      if (existingChat.active) {
        return { success: false, message: "Эта группа уже зарегистрирована в боте" }
      }

      // Если чат существует но деактивирован - реактивируем его
      this.logger.i(`Reactivating previously deactivated chat ${chatId}`)
      const reactivated = await this.chatRepository.activateChat(chatId)
      if (!reactivated) {
        return { success: false, message: "Ошибка при реактивации группы в базе данных" }
      }

      this.logger.i(`Chat ${chatId} successfully reactivated`)
      return { success: true }
    }

    // Получение администраторов чата
    const admins = await this.botService.getBotApi().getChatAdministrators({
      chat_id: chatId,
    })

    // Проверяем, что бот есть в списке администраторов
    const botId = await this.botService.getBotId()
    if (!botId) {
      return { success: false, message: "Не удалось получить информацию о боте" }
    }

    const isBotAdmin = admins.some(admin => admin.user.id === botId)
    const isUserAdmin = admins.some(admin => admin.user.id === userId)

    if (!isBotAdmin || !isUserAdmin) {
      return { success: false, message: "Бот должен быть администратором группы и вы должны быть администратором группы" }
    }

    // Создаем новый чат в базе данных
    const newChat = await this.chatRepository.createChat(chatId, chatTitle, chatType)
    if (!newChat) {
      return { success: false, message: "Ошибка при создании записи в базе данных" }
    }

    // Создаем конфигурацию по умолчанию
    await this.chatRepository.createChatConfig(chatId)

    // Сохраняем всех администраторов кроме бота
    for (const admin of admins) {
      if (admin.user.id !== botId) {
        await this.chatRepository.addAdmin(chatId, admin.user.id)
      }
    }

    this.logger.i(`New chat ${chatId} successfully registered`)
    return { success: true }
  }

  /**
   * Разрегистрация чата из бота
   */
  private async unregisterChat(chatId: number, userId: number): Promise<{ success: boolean, message?: string }> {
    // Проверяем, есть ли чат в базе
    const existingChat = await this.chatRepository.getChat(chatId)
    if (!existingChat) {
      return { success: false, message: "Эта группа не зарегистрирована в боте" }
    }

    try {
      // Получение администраторов чата
      const admins = await this.botService.getBotApi().getChatAdministrators({
        chat_id: chatId,
      })

      // Проверяем, что пользователь является администратором
      const isUserAdmin = admins.some(admin => admin.user.id === userId)
      if (!isUserAdmin) {
        return { success: false, message: "Только администраторы группы могут разрегистрировать её" }
      }

      // Деактивируем чат в базе данных
      const deactivated = await this.chatRepository.deactivateChat(chatId)
      if (!deactivated) {
        this.logger.e(`Failed to deactivate chat ${chatId}`)
        return { success: false, message: "Ошибка при деактивации записи в базе данных" }
      }

      this.logger.i(`Chat ${chatId} successfully deactivated by user ${userId}`)
      return { success: true }
    } catch (error) {
      this.logger.e(`Error during unregister process for chat ${chatId}:`, error)
      return { success: false, message: "Ошибка при получении информации о чате" }
    }
  }

  /**
   * Проверка, является ли пользователь администратором
   */
  private isAdmin(username?: string): boolean {
    return username === this.config.ADMIN_USERNAME?.replace("@", "")
  }

  private isAdminCommand(context: BotContext): boolean {
    return this.isAdmin(context.from?.username)
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
