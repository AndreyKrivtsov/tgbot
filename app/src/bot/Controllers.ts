import type { AppConfig } from "../config.js"
import type { Bot, Logger, Repository } from "../types.d.js"
import { config } from "../config.js"
import { AiService } from "../services/aiService/AiService.js"
import { AntispamService } from "../services/antispam/AntispamService.js"
import { Llama } from "../services/llama/llama.js"
import { WeatherService } from "../services/weather/WeatherService.js"
import { CommandController } from "./controllers/CommandController.js"
import { MemberController } from "./controllers/MemberController.js"
import { MessageController } from "./controllers/MessageController.js"
import { StartController } from "./controllers/StartController.js"

const weatherService = new WeatherService()
const aiService = new AiService(config)
const llama = new Llama()
const antispamService = new AntispamService(config)

export class Controllers {
  startController
  commandController
  messageController
  memberController

  constructor(config: AppConfig, bot: Bot, logger: Logger, repository: Repository) {
    const usersRepository = repository.getUsersRepository()

    this.startController = new StartController(config, bot, weatherService)
    this.commandController = new CommandController(config, bot, aiService)
    this.messageController = new MessageController(config, bot, usersRepository, aiService, llama, antispamService)
    this.memberController = new MemberController(logger, bot, usersRepository)
  }
}
