/**
 * Централизованное хранилище сообщений бота
 */
const MESSAGES = {
  // Приветствие и команды
  welcome: "🤖 Привет! Я Альтрон — ваш помощник по модерации.\n\nВведите /help для просмотра команд.",

  help: `🔧 **Мои функции:**

⚡ \`/start\` — запуск системы
⚡ \`/help\` — справка

**Для админов групп:**

⚡ \`/register\` — добавить группу в систему
⚡ \`/unregister\` — удалить группу
⚡ \`/ban @user\` — заблокировать пользователя
⚡ \`/unban @user\` — разблокировать
⚡ \`/mute @user\` — отключить сообщения
⚡ \`/unmute @user\` — включить сообщения

**В приватном чате:**

⚡ \`/addAltronKey @group_name API_KEY\` — подключить чатбота для группы`,

  // Капча
  captcha_welcome: `Добро пожаловать! Решите несложный пример:

{question} = ?

Выберите правильный ответ:`,

  captcha_failed: "К сожалению, {name} выбрал неправильный вариант ответа 😢",
  captcha_timeout: "К сожалению, {name} не выбрал ни один вариант ответа 🧐",

  // Спам
  spam_warning: "Хмм... 🧐\n{modifier}ообщение от [{name}] похоже на спам.\n\nСообщение удалено. \n\n{admin}",
  spam_kick: "Ну вот... 🤓\n[{name}] исключен за спам.\n\n{admin}",

  // Команды администратора
  ban_usage: "Использование: /ban @username или ответ на сообщение",
  ban_user_not_found: "🔍 Пользователь @{username} не найден. Используйте ответ на сообщение.",
  ban_specify_user: "Укажите пользователя или ответьте на его сообщение",
  ban_success: "🔒 {username} заблокирован",
  ban_error: "❌ Ошибка блокировки",

  unban_success: "🔓 {username} разблокирован",
  unban_error: "❌ Ошибка разблокировки",

  mute_success: "🔇 {username} отключен",
  mute_error: "❌ Ошибка отключения",

  unmute_success: "🔊 {username} включен",
  unmute_error: "❌ Ошибка включения",

  // API ключи
  api_key_private_only: "🔐 Команда работает только в приватном чате",
  api_key_usage: `🔑 **Подключение ИИ:**

\`/addAltronKey @chat_username API_KEY\`

• \`@chat_username\` — имя группы
• \`API_KEY\` — ваш ключ доступа`,

  api_key_invalid_format: "⚠️ Неверный формат команды",
  api_key_too_short: "🔑 Слишком короткий ключ",
  api_key_chat_not_found: `🔍 Группа @{username} не найдена.

Возможные причины:
• Группа не зарегистрирована (/register)
• Неверное имя группы
• Данные удалены`,

  api_key_no_permission: `🚫 Нет прав для группы @{username}.

Только админы могут подключать Чат-бота.`,

  api_key_success: `✅ **Чат-бот подключен!**

Напишите Бот, Эй бот, Альтрон, или тегните, или ответьте на мое сообщение.`,

  api_key_save_error: "💾 Ошибка сохранения. Попробуйте позже",
  api_key_general_error: "⚠️ Ошибка обработки команды",

  // Регистрация групп
  register_groups_only: "🏢 Команда только для групп",
  register_success: "✅ Группа добавлена в систему",
  register_error: "❌ Ошибка регистрации",

  unregister_success: "🗑️ Группа удалена из системы",
  unregister_error: "❌ Ошибка удаления",

  // Ошибки общие
  ai_response_error: "🤖 Мои схемы перегружены. Секундочку...",
  ai_service_error: `🔧 Опять программист накосячил...

Мои схемы нуждаются в техобслуживании.

Попробуйте позже.`,
  no_admin_permission: "🚫 Недостаточно прав",
  no_group_admin_permission: "🛡️ Нужны права админа группы",
  command_start_error: "⚠️ Ошибка запуска",
  help_command_error: "📋 Ошибка загрузки справки",

  // Ограничения пользователей
  user_restricted: "🚫 **Доступ ограничен**\n\nПричина: {reason}\n\n{admin}",

  // Callback ответы
  callback_user_error: "👤 Ошибка определения пользователя",
  callback_captcha_unavailable: "🧮 Капча недоступна", 
  callback_unknown_command: "❓ Неизвестная команда",
  callback_general_error: "⚠️ Ошибка обработки",
  callback_invalid_format: "📋 Неверный формат данных",
  callback_captcha_correct: "✅ Правильно!",
  callback_captcha_wrong: "❌ Неверно. Попробуйте еще",
  
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