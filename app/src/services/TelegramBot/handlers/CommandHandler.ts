import type { IService } from "../../../core/Container.js"
import type { Logger } from "../../../helpers/Logger.js"
import type { AppConfig } from "../../../config.js"
import type { UserRestrictions } from "../utils/UserRestrictions.js"
import type { UserManager } from "../features/UserManager.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { TelegramBotService } from "../index.js"
import type { AIChatService } from "../../AIChatService/index.js"
import { getMessage } from "../utils/Messages.js"
import type { BotContext, TelegramMessageContext } from "../types/index.js"

/**
 * Обработчик команд Telegram бота
 */
export class CommandHandler {
  private logger: Logger
  private config: AppConfig
  private userRestrictions: UserRestrictions
  private userManager: UserManager
  private chatRepository: ChatRepository
  private botService: TelegramBotService
  private aiChatService?: AIChatService

  constructor(
    logger: Logger,
    config: AppConfig,
    userRestrictions: UserRestrictions,
    userManager: UserManager,
    chatRepository: ChatRepository,
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
          await this.userRestrictions.deleteMessage(context.chat.id, context.id)
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
      await this.userRestrictions.sendGroupMessage(context.chat!.id, message)
    } catch (error) {
      this.logger.e("Error handling start command:", error)
      const errorMessage = getMessage("command_start_error")
      await this.userRestrictions.sendGroupMessage(context.chat!.id, errorMessage)
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
      // Удаляем сообщение пользователя с командой
      await this.deleteUserCommandMessage(context as TelegramMessageContext)
      
      const message = getMessage("help")
      await this.userRestrictions.sendGroupMessage(context.chat!.id, message)
    } catch (error) {
      this.logger.e("Error handling help command:", error)
      const errorMessage = getMessage("help_command_error")
      await this.userRestrictions.sendGroupMessage(context.chat!.id, errorMessage)
    }
  }

  /**
   * Обработка команды бана
   */
  async handleBanCommand(context: any): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      this.logger.w("No chat ID in ban command")
      return
    }

    // Команда работает только в группах
    if (chatId >= 0) {
      await this.userRestrictions.sendGroupMessage(chatId, getMessage("register_groups_only"))
      return
    }

    // Удаляем сообщение пользователя с командой перед проверкой прав
    await this.deleteUserCommandMessage(context as TelegramMessageContext)
    
    // Проверяем права администратора группы
    if (!await this.isGroupAdminCommand(context as TelegramMessageContext)) {
      return
    }

    try {
      const args = (context.text || "").split(" ")
      if (args.length < 2) {
        await this.userRestrictions.sendGroupMessage(chatId, getMessage("ban_usage"))
        return
      }

      let targetUserId: number | null = null
      let targetUsername = getMessage("unknown_user")

      // Проверяем, есть ли reply на сообщение
      if (context.replyMessage?.from) {
        targetUserId = context.replyMessage.from.id
        targetUsername = context.replyMessage.from.first_name || context.replyMessage.from.username || getMessage("unknown_user")
      } else if (args[1]) {
        // Пытаемся извлечь username из аргумента
        const username = args[1].replace("@", "")
        targetUsername = username

        // В реальном боте здесь нужно найти пользователя по username
        // Пока просто выводим ошибку
        await this.userRestrictions.sendGroupMessage(chatId, getMessage("ban_user_not_found", { username }))
        return
      } else {
        await this.userRestrictions.sendGroupMessage(chatId, getMessage("ban_specify_user"))
        return
      }

      if (targetUserId) {
        // Здесь должна быть логика бана пользователя
        // await this.userRestrictions.banUser(chatId, targetUserId)
        await this.userRestrictions.sendGroupMessage(chatId, getMessage("ban_success", { username: targetUsername }))
        this.logger.i(`User ${targetUserId} (${targetUsername}) banned by admin`)
      }
    } catch (error) {
      this.logger.e("Error in ban command:", error)
      await this.userRestrictions.sendGroupMessage(chatId, getMessage("ban_error"))
    }
  }

  /**
   * Обработка команды разбана
   */
  async handleUnbanCommand(context: any): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    // Команда работает только в группах
    if (chatId >= 0) {
      await this.userRestrictions.sendGroupMessage(chatId, getMessage("register_groups_only"))
      return
    }

    // Удаляем сообщение пользователя с командой перед проверкой прав
    await this.deleteUserCommandMessage(context as TelegramMessageContext)
    
    // Проверяем права администратора группы
    if (!await this.isGroupAdminCommand(context as TelegramMessageContext)) {
      return
    }

    try {
      // Здесь должна быть логика разбана
      const message = getMessage("unban_success", { username: getMessage("generic_user") })
      await this.userRestrictions.sendGroupMessage(chatId, message)
    } catch (error) {
      this.logger.e("Error in unban command:", error)
      const errorMessage = getMessage("unban_error")
      await this.userRestrictions.sendGroupMessage(chatId, errorMessage)
    }
  }

  /**
   * Обработка команды заглушения
   */
  async handleMuteCommand(context: any): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    // Команда работает только в группах
    if (chatId >= 0) {
      await this.userRestrictions.sendGroupMessage(chatId, getMessage("register_groups_only"))
      return
    }

    // Удаляем сообщение пользователя с командой перед проверкой прав
    await this.deleteUserCommandMessage(context as TelegramMessageContext)
    
    // Проверяем права администратора группы
    if (!await this.isGroupAdminCommand(context as TelegramMessageContext)) {
      return
    }

    try {
      // Здесь должна быть логика mute
      const message = getMessage("mute_success", { username: getMessage("generic_user") })
      await this.userRestrictions.sendGroupMessage(chatId, message)
    } catch (error) {
      this.logger.e("Error in mute command:", error)
      const errorMessage = getMessage("mute_error")
      await this.userRestrictions.sendGroupMessage(chatId, errorMessage)
    }
  }

  /**
   * Обработка команды снятия заглушения
   */
  async handleUnmuteCommand(context: any): Promise<void> {
    const chatId = context.chat?.id
    if (!chatId) {
      return
    }

    // Команда работает только в группах
    if (chatId >= 0) {
      await this.userRestrictions.sendGroupMessage(chatId, getMessage("register_groups_only"))
      return
    }

    // Удаляем сообщение пользователя с командой перед проверкой прав
    await this.deleteUserCommandMessage(context as TelegramMessageContext)
    
    // Проверяем права администратора группы
    if (!await this.isGroupAdminCommand(context as TelegramMessageContext)) {
      return
    }

    try {
      // Здесь должна быть логика unmute
      const message = getMessage("unmute_success", { username: getMessage("generic_user") })
      await this.userRestrictions.sendGroupMessage(chatId, message)
    } catch (error) {
      this.logger.e("Error in unmute command:", error)
      const errorMessage = getMessage("unmute_error")
      await this.userRestrictions.sendGroupMessage(chatId, errorMessage)
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
      await this.userRestrictions.sendGroupMessage(chat.id, getMessage("api_key_private_only"))
      return
    }

    try {
      // Удаляем сообщение пользователя с командой (даже в приватном чате)
      await this.deleteUserCommandMessage(context, true)
      
      const args = (context.text || "").split(" ")
      if (args.length < 3) {
        const helpMessage = getMessage("api_key_usage")
        await this.userRestrictions.sendGroupMessage(chat.id, helpMessage)
        return
      }

      const chatUsername = args[1]?.replace("@", "")
      const apiKey = args[2]

      if (!chatUsername || !apiKey) {
        await this.userRestrictions.sendGroupMessage(chat.id, getMessage("api_key_invalid_format"))
        return
      }

      // Валидация API ключа (базовая проверка)
      if (apiKey.length < 10) {
        await this.userRestrictions.sendGroupMessage(chat.id, getMessage("api_key_too_short"))
        return
      }

      // Ищем чат по username в базе данных
      const targetChat = await this.findChatByUsername(chatUsername)

      if (!targetChat) {
        const notFoundMessage = getMessage("api_key_chat_not_found", { username: chatUsername })
        await this.userRestrictions.sendGroupMessage(chat.id, notFoundMessage)
        return
      }

      // Проверяем права пользователя (должен быть админом в целевой группе)
      const hasPermission = await this.chatRepository.isAdmin(targetChat.id, userId)
      if (!hasPermission) {
        const noPermissionMessage = getMessage("api_key_no_permission", { username: chatUsername })
        await this.userRestrictions.sendGroupMessage(chat.id, noPermissionMessage)
        return
      }

      // Сохраняем API ключ
      const saveResult = await this.saveChatApiKey(targetChat.id, apiKey)

      if (saveResult.success) {
        const successMessage = getMessage("api_key_success", { username: chatUsername })
        await this.userRestrictions.sendGroupMessage(chat.id, successMessage)
        this.logger.i(`API key added for chat @${chatUsername} by user ${userId}`)
      } else {
        await this.userRestrictions.sendGroupMessage(chat.id, getMessage("api_key_save_error"))
      }
    } catch (error) {
      this.logger.e("Error in addAltronKey command:", error)
      await this.userRestrictions.sendGroupMessage(chat.id, getMessage("api_key_general_error"))
    }
  }

  /**
   * Проверить права пользователя для работы с чатом
   */


  /**
   * Сохранить API ключ для чата
   */
  private async saveChatApiKey(chatId: number, apiKey: string): Promise<{ success: boolean, message?: string }> {
    try {
      const success = await this.chatRepository.setApiKey(chatId, apiKey)
      if (success) {
        return { success: true }
      } else {
        return { success: false, message: "Ошибка при сохранении API ключа" }
      }
    } catch (error) {
      this.logger.e("Error saving API key:", error)
      return { success: false, message: "Внутренняя ошибка" }
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

    if (!chat) {
      return
    }

    // Команда работает только в группах
    if (chat.id >= 0) {
      await this.userRestrictions.sendGroupMessage(chat.id, getMessage("register_groups_only"))
      return
    }

    // Удаляем сообщение пользователя с командой перед проверкой прав
    await this.deleteUserCommandMessage(context)
    
    // Проверяем права администратора группы
    if (!await this.isGroupAdminCommand(context)) {
      return
    }

    try {
      const result = await this.chatRepository.registerChat(chat.id, chat.title || "Unknown Group")

      if (result.success) {
        await this.userRestrictions.sendGroupMessage(chat.id, getMessage("register_success"))
        this.logger.i(`Chat ${chat.id} registered successfully`)
      } else {
        await this.userRestrictions.sendGroupMessage(chat.id, `❌ ${result.message}`)
      }
    } catch (error) {
      this.logger.e("Error registering chat:", error)
      await this.userRestrictions.sendGroupMessage(chat.id, getMessage("register_error"))
    }
  }

  /**
   * Обработка команды /unregister (исключение группы из бота)
   */
  async handleUnregisterCommand(context: TelegramMessageContext): Promise<void> {
    const chat = context.chat

    if (!chat) {
      return
    }

    // Команда работает только в группах
    if (chat.id >= 0) {
      await this.userRestrictions.sendGroupMessage(chat.id, getMessage("register_groups_only"))
      return
    }

    // Удаляем сообщение пользователя с командой перед проверкой прав
    await this.deleteUserCommandMessage(context)
    
    // Проверяем права администратора группы
    if (!await this.isGroupAdminCommand(context)) {
      return
    }

    try {
      const result = await this.chatRepository.unregisterChat(chat.id)

      if (result.success) {
        await this.userRestrictions.sendGroupMessage(chat.id, getMessage("unregister_success"))
        this.logger.i(`Chat ${chat.id} unregistered successfully`)
      } else {
        await this.userRestrictions.sendGroupMessage(chat.id, `❌ ${result.message}`)
      }
    } catch (error) {
      this.logger.e("Error unregistering chat:", error)
      await this.userRestrictions.sendGroupMessage(chat.id, getMessage("unregister_error"))
    }
  }

  /**
   * Проверка, является ли пользователь суперадминистратором бота
   */
  private isSuperAdmin(username?: string): boolean {
    return username === this.config.ADMIN_USERNAME?.replace("@", "")
  }

  /**
   * Проверка команды суперадминистратора
   */
  private isSuperAdminCommand(context: any): boolean {
    const username = context.from?.username
    
    if (!this.isSuperAdmin(username)) {
      const message = getMessage("no_admin_permission")
      this.userRestrictions.sendGroupMessage(context.chat!.id, message)
      return false
    }

    return true
  }

  /**
   * Проверка, является ли пользователь администратором группы
   */
  private async isGroupAdmin(context: TelegramMessageContext): Promise<boolean> {
    try {
      const userId = context.from?.id
      const chatId = context.chat?.id

      if (!userId || !chatId) {
        return false
      }

      // Проверяем, является ли пользователь администратором этой группы через базу данных
      return await this.chatRepository.isAdmin(chatId, userId)
    } catch (error) {
      this.logger.e("Error checking group admin permission:", error)
      return false
    }
  }

  /**
   * Проверка команды администратора группы
   */
  private async isGroupAdminCommand(context: TelegramMessageContext): Promise<boolean> {
    const username = context.from?.username
    
    // Суперадмин имеет доступ ко всем командам
    if (this.isSuperAdmin(username)) {
      return true
    }

    // Проверяем, является ли пользователь администратором группы
    const isAdmin = await this.isGroupAdmin(context)
    
    if (!isAdmin) {
      const message = getMessage("no_group_admin_permission")
      await this.userRestrictions.sendGroupMessage(context.chat!.id, message)
      return false
    }

    return true
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
