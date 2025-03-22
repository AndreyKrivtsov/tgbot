import type { Bot, MessageContext } from "gramio"
import type { AiService } from "../services/aiService/AiService.js"
import type { Llama } from "../services/llama/llama.js"
import { aiAnswerAction } from "../actions/aiAnswerAction.js"
import { answerAction } from "../actions/answerAction.js"

interface RestrictedUser {
  userId: number
  questionId: number
  answer: string
  timestamp: number
  isAnswered: boolean
  isSuccessful: boolean
}

export class MessageController {
  bot: Bot
  aiService: AiService
  llama: Llama

  restrictedUsers: Record<number, RestrictedUser> = {}

  constructor(bot: Bot, aiService: AiService, llama: Llama) {
    this.bot = bot
    this.aiService = aiService
    this.llama = llama
  }

  start(context: MessageContext<Bot>) {
    aiAnswerAction({ bot: this.bot, context, ai: this.aiService.ai })
    answerAction({ bot: this.bot, context, llama: this.llama })
  }
}
