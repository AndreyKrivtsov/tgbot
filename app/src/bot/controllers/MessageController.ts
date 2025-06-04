import type { Bot, MessageContext } from "gramio"
import type { AiService } from "../../services/aiService/AiService.js"
import type { AntispamService } from "../../services/antispam/AntispamService.js"
import type { Llama } from "../../services/llama/llama.js"
import type { AppConfig, User, UserRepository } from "../../types.d.js"
import { aiAnswerAction } from "../actions/aiAnswerAction.js"
import { answerAction } from "../actions/answerAction.js"

export class MessageController {
  config: AppConfig
  bot: Bot
  users: UserRepository
  aiService: AiService
  llama: Llama
  antispamService: AntispamService

  constructor(config: AppConfig, bot: Bot, users: UserRepository, aiService: AiService, llama: Llama, antispamService: AntispamService) {
    this.config = config
    this.bot = bot
    this.users = users
    this.aiService = aiService
    this.llama = llama
    this.antispamService = antispamService
  }

  async start(context: MessageContext<Bot>) {
    const user = this.getUserOrNew(context)

    if (!user || !context.text) {
      return
    }

    const restricted = this.users.isRestricted(user.id)
    if (restricted) {
      const message = context.text
      context.delete()
      context.reply(`Вы заблокированы. \n\nПричина: ${restricted.reason}\n\n${this.config.ADMIN_USERNAME ?? ""}`)
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

  getUserOrNew(context: MessageContext<Bot>) {
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
    const username = context.from?.username ?? ""
    const fullName = `${context.from?.firstName ?? ""} ${context.from?.lastName ?? ""}`.trim()
    context.reply(`Хмм... 🧐\nСообщение от [${fullName}${username ? `, @${username}` : ""}] похоже на спам.\n\nСообщение удалено. \n\n${this.config.ADMIN_USERNAME ?? ""}`)
    context.delete()
  }
}
