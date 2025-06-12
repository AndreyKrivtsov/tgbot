/**
 * Централизованное хранилище сообщений бота
 */
const MESSAGES = {
  // Приветствие и команды
  welcome: "👋 **Добро пожаловать!**\n\nЯ помогу модерировать этот чат.\n\nИспользуйте /help для просмотра доступных команд.",

  help: `📋 **Доступные команды:**

🔹 \`/start\` - запуск бота
🔹 \`/help\` - справка по командам

👥 **Команды администратора группы:**

🔹 \`/register\` - зарегистрировать группу (только в группах, только для админов)
🔹 \`/unregister\` - исключить группу из бота (только в группах, только для админов)
🔹 \`/ban @user\` - забанить пользователя (только в группах, только для админов)
🔹 \`/unban @user\` - разбанить пользователя (только в группах, только для админов)
🔹 \`/mute @user\` - заглушить пользователя (только в группах, только для админов)
🔹 \`/unmute @user\` - снять заглушение (только в группах, только для админов)

🔒 **Команды в приватном чате:**

🔹 \`/addAltronKey @group_name API_KEY\` - добавить AI ключ для группы (только в ЛС, только для админов группы)`,

  // Капча
  captcha_welcome: `Добро пожаловать! Решите несложный пример:

{question} = ?

Выберите правильный ответ:`,

  captcha_failed: "К сожалению, {name} выбрал неправильный вариант ответа 😢",
  captcha_timeout: "К сожалению, {name} не выбрал ни один вариант ответа 🧐",

  // Спам
  spam_warning: "Хмм... 🧐\n{modifier}ообщение от [{name}] похоже на спам.\n\nСообщение удалено. \n\n{admin}",
  spam_kick: "Ну вот... 🤓\n[{name}] исключен из чата за спам.\n\n{admin}",

  // Команды администратора
  ban_usage: "Использование: /ban @username или /ban (ответ на сообщение)",
  ban_user_not_found: "⚠️ Не удалось найти пользователя @{username}. Используйте reply на сообщение пользователя.",
  ban_specify_user: "Укажите пользователя для бана или ответьте на его сообщение",
  ban_success: "✅ Пользователь {username} забанен",
  ban_error: "❌ Ошибка при выполнении команды бана",

  unban_success: "✅ Пользователь {username} разбанен",
  unban_error: "❌ Ошибка при выполнении команды разбана",

  mute_success: "✅ Пользователь {username} заглушен",
  mute_error: "❌ Ошибка при выполнении команды заглушения",

  unmute_success: "✅ С пользователя {username} снято заглушение",
  unmute_error: "❌ Ошибка при выполнении команды снятия заглушения",

  // API ключи
  api_key_private_only: "❌ Эта команда работает только в приватном чате с ботом",
  api_key_usage: `📝 Использование: \`/addAltronKey @chat_username API_KEY\`

Где:
• \`@chat_username\` - юзернейм группы
• \`API_KEY\` - ваш API ключ для Altron AI`,

  api_key_invalid_format: "❌ Неверный формат команды",
  api_key_too_short: "❌ API ключ слишком короткий",
  api_key_chat_not_found: `❌ Группа @{username} не найдена в базе данных.

Возможные причины:
• Группа не зарегистрирована в боте (используйте /register в группе)
• Неверный username группы
• Группа была удалена из базы данных`,

  api_key_no_permission: `❌ У вас нет прав для добавления API ключа в группу @{username}.

Только администраторы группы могут добавлять API ключи.`,

  api_key_success: `✅ API ключ успешно добавлен для группы @{username}!

Теперь участники группы могут общаться с AI помощником, упоминая бота в сообщениях.`,

  api_key_save_error: "❌ Не удалось сохранить API ключ. Попробуйте позже.",
  api_key_general_error: "❌ Произошла ошибка при обработке команды",

  // Регистрация групп
  register_groups_only: "❌ Эта команда работает только в группах",
  register_success: "✅ Группа успешно зарегистрирована в боте!",
  register_error: "❌ Ошибка при регистрации группы",

  unregister_success: "✅ Группа успешно исключена из бота!",
  unregister_error: "❌ Ошибка при разрегистрации группы",

  // Ошибки общие
  ai_response_error: "❌ Произошла ошибка при отправке ответа AI",
  ai_service_error: `❌ **Произошла ошибка при обращении к AI сервису**

Попробуйте повторить запрос позже.`,
  no_admin_permission: "❌ У вас нет прав для использования этой команды.",
  no_group_admin_permission: "❌ У вас нет прав администратора в этой группе для использования данной команды.",
  command_start_error: "❌ Не удалось выполнить команду /start",
  help_command_error: "Не удалось показать справку",

  // Ограничения пользователей
  user_restricted: "Вы заблокированы\\. \n\nПричина: {reason}\n\n{admin}",

  // Callback ответы
  callback_user_error: "Ошибка определения пользователя",
  callback_captcha_unavailable: "Сервис капчи недоступен", 
  callback_unknown_command: "Неизвестная команда",
  callback_general_error: "Произошла ошибка",
  callback_invalid_format: "Неверный формат данных",
  callback_captcha_correct: "Правильно!",
  callback_captcha_wrong: "Неправильный ответ!",
  
  // Общие тексты
  reason_not_specified: "Не указана",
  unknown_user: "неизвестный",
  generic_user: "пользователь",
} as const

/**
 * Получение сообщения с подстановкой переменных
 * @param key - ключ сообщения
 * @param params - объект с переменными для подстановки
 * @returns отформатированное сообщение
 */
export function getMessage(key: keyof typeof MESSAGES, params: Record<string, string | number> = {}): string {
  let message = MESSAGES[key] as string
  
  // Простая подстановка переменных {variable}
  Object.entries(params).forEach(([paramKey, value]) => {
    const placeholder = `{${paramKey}}`
    message = message.replace(new RegExp(placeholder, 'g'), String(value))
  })
  
  return message
}

/**
 * Проверка существования сообщения
 */
export function hasMessage(key: string): key is keyof typeof MESSAGES {
  return key in MESSAGES
}

/**
 * Получение всех доступных ключей сообщений (для отладки)
 */
export function getMessageKeys(): string[] {
  return Object.keys(MESSAGES)
} 