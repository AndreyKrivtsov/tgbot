import type { Bot } from "gramio"
import { config } from "./config.js"
import { CommandController } from "./controllers/CommandController.js"
import { MemberController } from "./controllers/MemberController.js"
import { MessageController } from "./controllers/MessageController.js"
import { AiService } from "./services/aiService/AiService.js"
import { Llama } from "./services/llama/llama.js"
import { WeatherService } from "./services/weather/WeatherService.js"
import { StartController } from "./controllers/StartController.js"

const weatherService = new WeatherService()
const aiService = new AiService(config)
const llama = new Llama()

export class Controllers {
  startController
  commandController
  messageController
  memberController

  private bot: Bot

  constructor(bot: Bot) {
    this.bot = bot

    this.startController = new StartController(bot, weatherService)
    this.commandController = new CommandController(bot, aiService)
    this.messageController = new MessageController(bot, aiService, llama)
    this.memberController = new MemberController(bot)
  }
}
