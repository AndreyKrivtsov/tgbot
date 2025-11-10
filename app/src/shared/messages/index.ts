import type { IMessageProvider } from "./interfaces.js"
import { StaticMessageProvider } from "./StaticMessageProvider.js"
import type { MessageKey } from "./StaticMessageProvider.js"

/**
 * Фабрика для создания провайдера сообщений
 * По умолчанию возвращает статический провайдер
 */
export function createMessageProvider(): IMessageProvider {
  return new StaticMessageProvider()
}

// Экспорт интерфейсов и типов
export type { IMessageProvider, MessageKey }
export { StaticMessageProvider }

// Дефолтный провайдер для обратной совместимости
const defaultProvider = new StaticMessageProvider()

/**
 * Получение сообщения с подстановкой переменных
 * Функция для обратной совместимости с существующим кодом
 * @param key - ключ сообщения
 * @param params - объект с переменными для подстановки
 * @returns отформатированное сообщение
 */
export function getMessage(key: MessageKey | string, params: Record<string, string | number> = {}): string {
  return defaultProvider.getMessage(key, params)
}

/**
 * Проверка существования сообщения
 * Функция для обратной совместимости
 */
export function hasMessage(key: string): boolean {
  return defaultProvider.hasMessage(key)
}

/**
 * Получение всех доступных ключей сообщений (для отладки)
 * Функция для обратной совместимости
 */
export function getMessageKeys(): string[] {
  return defaultProvider.getMessageKeys()
}
