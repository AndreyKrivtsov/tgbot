/**
 * Утилиты для форматирования сообщений в Telegram боте
 */
export class MessageFormatter {
  /**
   * Экранирование символов для MarkdownV2
   */
  static escapeMarkdownV2(text: string): string {
    // Символы, которые нужно экранировать в MarkdownV2:
    // _ * [ ] ( ) ~ ` > # + - = | { } . !
    return text.replace(/[_*[\]()~`>#+=|{}.!\\-]/g, "\\$&")
  }

  /**
   * Экранирование символов для Markdown (V1)
   */
  static escapeMarkdown(text: string): string {
    // Экранируем только основные символы Markdown: _, *, `
    return text.replace(/[_*`]/g, "\\$&")
  }
}
