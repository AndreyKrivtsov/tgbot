import type { ChatRepository } from "../../repository/ChatRepository.js"

export class ChatConfigService {
  constructor(private chatRepository: ChatRepository) {}

  /**
   * Получить API ключ для чата
   * Сначала проверяем базу данных, если нет - возвращаем моковое значение
   */
  async getApiKey(chatId: number): Promise<string> {
    try {
      const config = await this.chatRepository.getChatConfig(chatId)

      // Если есть настройка в базе и она не пустая
      if (config?.geminiApiKey) {
        return config.geminiApiKey
      }

      // Моковое значение для разработки
      return "AIzaSyDXLzE1yp_hFC512YUJgPocKpKwfTV6zCs"
    } catch (error) {
      console.error("Error getting API key for chat:", chatId, error)
      return "mock_gemini_api_key_for_development"
    }
  }

  /**
   * Получить ID чата по умолчанию (для обратной совместимости)
   * Возвращает моковое значение, так как в мультичатовом боте это не используется
   */
  getDefaultChatId(): number {
    // Моковое значение - в мультичатовом боте это не должно использоваться
    console.warn("getDefaultChatId() called - this should not be used in multi-chat bot")
    return -1002323002502
  }

  /**
   * Установить API ключ для чата
   */
  async setApiKey(chatId: number, apiKey: string): Promise<boolean> {
    try {
      // Создаем чат и конфиг если их нет
      await this.chatRepository.getOrCreateChat(chatId)

      // Обновляем API ключ
      return await this.chatRepository.setApiKey(chatId, apiKey)
    } catch (error) {
      console.error("Error setting API key for chat:", chatId, error)
      return false
    }
  }

  // async setThrottleDelay(chatId: number, delay: number): Promise<boolean> {
  //   try {
  //     // Создаем чат и конфиг если их нет
  //     await this.chatRepository.getOrCreateChat(chatId)
  //     // Обновляем задержку
  //     return await this.chatRepository.setThrottleDelay(chatId, delay)
  //   } catch (error) {
  //     console.error("Error setting throttle delay for chat:", chatId, error)
  //     return false
  //   }
  // }
}
