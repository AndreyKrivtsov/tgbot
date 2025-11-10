/**
 * Интерфейс провайдера сообщений
 * Позволяет абстрагироваться от конкретной реализации (статический, i18n, БД и т.д.)
 */
export interface IMessageProvider {
  /**
   * Получение сообщения с подстановкой переменных
   * @param key - ключ сообщения
   * @param params - объект с переменными для подстановки
   * @returns отформатированное сообщение
   */
  getMessage: (key: string, params?: Record<string, string | number>) => string

  /**
   * Проверка существования сообщения
   * @param key - ключ сообщения
   * @returns true, если сообщение существует
   */
  hasMessage: (key: string) => boolean

  /**
   * Получение всех доступных ключей сообщений
   * @returns массив ключей
   */
  getMessageKeys: () => string[]
}
