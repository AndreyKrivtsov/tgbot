import type { Bot, MessageContext } from "gramio"
import type { AiService } from "../services/aiService/AiService.js"
import { config } from "../config.js"

type Command = "start" | "context"

type AiServiceParam = "maxOutputTokens" | "temperature" | "topK" | "topP" | "seed" | "frequencyPenalty"

export class CommandController {
  bot: Bot
  aiService: AiService
  commands: Record<Command, (...args: any) => any>

  constructor(bot: Bot, aiService: AiService) {
    this.bot = bot
    this.aiService = aiService

    this.commands = {
      start: this.startCommand,
      context: this.contextCommand,
    }
  }

  listCommands() {
    return Object.keys(this.commands) as Command[]
  }

  start(command: Command, context: MessageContext<Bot>) {
    this.commands[command](context)
  }

  startCommand(context: MessageContext<Bot>) {
    context.send("Привет! Я бот Подслушано. Мне постоянно добавляют новые функции. Возможно, скоро, я смогу захватить мир.")
  }

  async contextCommand(context: MessageContext<Bot>) {
    const contextLength = await this.aiService.contextLength(config.DEFAULT_CHAT_ID.toString())
    if (contextLength) {
      const replyText = `Длина массива сообщений: ${contextLength.messages}\nОбщая длина текста: ${contextLength.text}`
      context.reply(replyText)
    } else {
      context.reply("История пуста")
    }
  }

  // setParam(context: MessageContext<Bot>) {
  //   const params = ["maxOutputTokens", "temperature", "topK", "topP", "seed"]
  //   const param = context.text?.replace("/", "").replace(/\s\d*/g, "")
  //   const value = Number(context.text?.replace(/\/\w+\s/g, ""))

  //   if (!param || !params.includes(param) || !Number.isInteger(value)) {
  //     context.reply(`Пустой параметр или значение. Передано: ${context.text}`)
  //     return
  //   }

  //   if (!(param in ai.config)) {
  //     context.reply("Нет такого параметра")
  //     return
  //   }

  //   ai.config[param as AiBotParam] = value
  //   context.reply(`Параметр "${param}" установлен в ${value}`)
  // }
}
