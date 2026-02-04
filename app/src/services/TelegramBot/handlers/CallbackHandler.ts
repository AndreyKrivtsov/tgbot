import type { Logger } from "../../../helpers/Logger.js"
import type { TelegramBot } from "../types/index.js"
import type { CaptchaService } from "../../CaptchaService/index.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"
import type { EventBus, GroupAgentReviewDecisionEvent } from "../../../core/EventBus.js"
import { getMessage } from "../../../shared/messages/index.js"

/**
 * Обработчик callback запросов (inline кнопки)
 */
export class CallbackHandler {
  private logger: Logger
  private bot: TelegramBot
  private captchaService?: CaptchaService
  private chatRepository: ChatRepository
  private eventBus: EventBus

  constructor(
    logger: Logger,
    bot: TelegramBot,
    chatRepository: ChatRepository,
    eventBus: EventBus,
    captchaService?: CaptchaService,
  ) {
    this.logger = logger
    this.bot = bot
    this.chatRepository = chatRepository
    this.eventBus = eventBus
    this.captchaService = captchaService
  }

  /**
   * Основной обработчик callback запросов
   */
  async handleCallbackQuery(context: any): Promise<void> {
    try {
      const userId = context.from?.id
      const callbackData = context.data

      if (!userId) {
        await this.answerCallback(context, getMessage("callback_user_error"))
        return
      }

      // Обработка капчи
      if (callbackData?.startsWith("captcha_")) {
        if (!this.captchaService) {
          await this.answerCallback(context, getMessage("callback_captcha_unavailable"))
          return
        }
        const userId = context.from?.id
        const parts = callbackData.split("_")
        if (parts.length !== 4 || parts[0] !== "captcha") {
          await this.answerCallback(context, getMessage("callback_invalid_format"))
          return
        }
        const callbackUserId = Number.parseInt(parts[1] || "0", 10)
        const isCorrect = parts[3] === "correct"

        if (callbackUserId !== userId) {
          // Чужая капча — игнор
          return
        }

        // Делегируем use-case'у
        try {
          await this.captchaService.submitAnswer({
            userId,
            isCorrect,
          })
        } catch (e) {
          this.logger.e("Error submitting captcha answer:", e)
          await this.answerCallback(context, getMessage("callback_general_error"))
          return
        }

        const replyText = isCorrect ? getMessage("callback_captcha_correct") : getMessage("callback_captcha_wrong")
        await this.answerCallback(context, replyText)
      } else if (callbackData?.startsWith("review:")) {
        await this.handleReviewCallback(context, userId, callbackData)
      } else {
        await this.answerCallback(context, getMessage("callback_unknown_command"))
      }
    } catch (error) {
      this.logger.e("❌ Error handling callback query:", error)
      await this.answerCallback(context, getMessage("callback_general_error"))
    }
  }

  private async handleReviewCallback(context: any, userId: number, callbackData: string): Promise<void> {
    const parts = callbackData.split(":")
    if (parts.length !== 3) {
      await this.answerCallback(context, "Некорректный формат запроса")
      return
    }

    const reviewId = parts[1]!
    const action = parts[2]!
    if (action !== "approve" && action !== "reject") {
      await this.answerCallback(context, "Неизвестное действие")
      return
    }

    const chatId = context.message?.chat?.id
    if (!chatId) {
      await this.answerCallback(context, "Не удалось определить чат")
      return
    }

    const isAdmin = await this.chatRepository.isAdmin(chatId, userId)
    if (!isAdmin) {
      await this.answerCallback(context, "Только администраторы могут подтверждать действия")
      return
    }

    const decision: GroupAgentReviewDecisionEvent = {
      reviewId,
      chatId,
      moderatorId: userId,
      action: action === "approve" ? "approve" : "reject",
    }

    await this.eventBus.emitGroupAgentReviewDecision(decision)

    const responseMessage = decision.response?.message ?? "Запрос обработан"
    await this.answerCallback(context, responseMessage)
  }

  // legacy handleCaptchaCallback удалён

  /**
   * Отправка ответа на callback query
   */
  private async answerCallback(context: any, text: string): Promise<void> {
    try {
      if (context.answerCallbackQuery) {
        await context.answerCallbackQuery({ text })
      } else if (context.answer) {
        await context.answer(text)
      } else {
        this.logger.w("No method to answer callback query found in context")
      }
    } catch (error) {
      this.logger.e("Error answering callback query:", error)
    }
  }
}
