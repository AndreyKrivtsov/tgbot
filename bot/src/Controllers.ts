import type { Bot } from "gramio"
import { config } from "./config.js"
import { CommandController } from "./controllers/CommandController.js"
import { MemberController } from "./controllers/MemberController.js"
import { MessageController } from "./controllers/MessageController.js"
import { StartController } from "./controllers/StartController.js"
import { Users } from "./helpers/Users.js"
import { AiService } from "./services/aiService/AiService.js"
import { AntispamService } from "./services/antispam/AntispamService.js"
import { Llama } from "./services/llama/llama.js"
import { WeatherService } from "./services/weather/WeatherService.js"

const usersRepository = new Users()
const weatherService = new WeatherService()
const aiService = new AiService(config)
const llama = new Llama()
const antispamService = new AntispamService(config)

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
    this.messageController = new MessageController(bot, config, usersRepository, aiService, llama, antispamService)
    this.memberController = new MemberController(bot, usersRepository)
  }
}
