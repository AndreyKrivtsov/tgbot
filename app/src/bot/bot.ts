import type { Logger, Repository } from "../types.js"
import { config } from "../config.js"
import { Bot } from "./bot/Bot.js"
import { Controllers } from "./Controllers.js"

function startBot(logger: Logger, repository: Repository) {
  const bot = new Bot(config.BOT_TOKEN)
  const controllers = new Controllers(config, bot, logger, repository)

  bot.onStart(() => controllers.startController.run())

  bot.on("chat_member", context => controllers.memberController.start(context))

  // bot.on("message", context => controllers.messageController.start(context))

  // controllers.commandController.listCommands().forEach((command) => {
  // bot.command(command, context => controllers.commandController.start(command, context))
  // })

  // bot.use((context) => {
  // controllers.memberController.start(context)
  // })

  try {
    bot.start()
    console.log("Bot started")
  } catch (e) {
    console.error(e)
    setTimeout(() => {
      startBot(logger, repository)
    }, 5000)
  }

  return bot
}

export { startBot }
