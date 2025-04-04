import type { Bot, MessageContext } from "gramio"
import type { AppConfig } from "../config.js"
import type { User, Users } from "../helpers/Users.js"
import type { AiService } from "../services/aiService/AiService.js"
import type { AntispamService } from "../services/antispam/AntispamService.js"
import type { Llama } from "../services/llama/llama.js"
import { aiAnswerAction } from "../actions/aiAnswerAction.js"
import { answerAction } from "../actions/answerAction.js"

export class MessageController {
  bot: Bot
  config: AppConfig
  users: Users
  aiService: AiService
  llama: Llama
  antispamService: AntispamService

  constructor(bot: Bot, config: AppConfig, users: Users, aiService: AiService, llama: Llama, antispamService: AntispamService) {
    this.bot = bot
    this.config = config
    this.users = users
    this.aiService = aiService
    this.llama = llama
    this.antispamService = antispamService
  }

  async start(context: MessageContext<Bot>) {
    const user = this.getUser(context)

    console.log(context.chat)

    if (!user || !context.text) {
      return
    }

    const isSpam = await this.antispam(user, context.text)

    if (isSpam) {
      this.spamAction(context)
      return
    }

    aiAnswerAction({ bot: this.bot, context, ai: this.aiService.ai })
    answerAction({ bot: this.bot, context, llama: this.llama })

    this.users.increaseMessages(user.id)
  }

  getUser(context: MessageContext<Bot>) {
    if (!context.from?.id) {
      return
    }

    let user

    if (!this.users.exist(context.from.id)) {
      user = this.users.newUser({
        id: context.from.id,
        username: context.from.username,
        firstname: context.from.firstName,
      })
    }

    user = this.users.getUser(context.from.id)

    if (!user) {
      return
    }

    return user
  }

  async antispam(user: User, message: string) {
    if (user.messages < 3) {
      return await this.antispamService.check(message)
    }

    return false
  }

  spamAction(context: MessageContext<Bot>) {
    context.reply(`Хмм... Очень похоже на спам 🧐\n\n${this.config.ADMIN_USERNAME ?? ""}`)
  }
}
