/**
 * Утилиты для форматирования сообщений в Telegram боте
 */
export class MessageFormatter {
  /**
   * Экранирование символов для HTML
   */
  static escapeHTML(text: string): string {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  }

  /**
   * Экранирование символов для MarkdownV2
   */
  static escapeMarkdownV2(text: string): string {
    // Символы, которые нужно экранировать в MarkdownV2:
    // _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&")
  }

  /**
   * Форматирование текста команды помощи
   */
  static formatHelpText(): string {
    const commands = [
      "🔹 `/start` - запуск бота",
      "🔹 `/help` - справка по командам",
      "🔹 `/register` - зарегистрировать группу (только в группах)",
      "🔹 `/unregister` - исключить группу из бота (только в группах)",
    ]

    const adminCommands = [
      "🔹 `/ban @user` - забанить пользователя",
      "🔹 `/unban @user` - разбанить пользователя",
      "🔹 `/mute @user` - заглушить пользователя",
      "🔹 `/unmute @user` - снять заглушение",
    ]

    const privateCommands = [
      "🔹 `/addAltronKey @group_name API_KEY` - добавить AI ключ для группы (только в ЛС)",
    ]

    return `📋 **Доступные команды:**\n\n${commands.join("\n")}\n\n👑 **Команды администратора:**\n\n${adminCommands.join("\n")}\n\n🔒 **Команды в приватном чате:**\n\n${privateCommands.join("\n")}`
  }

  /**
   * Форматирование приветственного сообщения
   */
  static formatWelcomeMessage(): string {
    return `👋 **Добро пожаловать!**\n\nЯ помогу модерировать этот чат.\n\nИспользуйте /help для просмотра доступных команд.`
  }

  /**
   * Форматирование сообщения об ошибке
   */
  static formatErrorMessage(error: string): string {
    return `${error}`
  }

  /**
   * Форматирование сообщения об отсутствии API ключа AI
   */
  static formatApiKeyMissingMessage(): string {
    return `❌ **API ключ для AI не настроен**

Для использования AI необходимо:
1. Получить API ключ от Google AI Studio
2. Настроить его для этого чата

Обратитесь к администратору группы.`
  }

  /**
   * Форматирование сообщения об ошибке AI сервиса
   */
  static formatAIServiceErrorMessage(): string {
    return `❌ **Произошла ошибка при обращении к AI сервису**

Попробуйте повторить запрос позже.`
  }

  /**
   * Форматирование сообщения об успешной операции
   */
  static formatSuccessMessage(message: string): string {
    return `${message}`
  }

  /**
   * Форматирование имени пользователя для отображения
   */
  static formatUserName(user: { username?: string, first_name?: string, id: number }): string {
    if (user.username) {
      return `@${user.username}`
    }
    if (user.first_name) {
      return user.first_name
    }
    return `User${user.id}`
  }
}
