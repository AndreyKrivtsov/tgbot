import { Bot } from "gramio"
import { config } from "./config.js"
import { Controllers } from "./Controllers.js"

const bot = new Bot(config.BOT_TOKEN)
const controllers = new Controllers(bot)

bot.onStart(() => controllers.startController.run())

bot.on("chat_member", context => controllers.memberController.chatMember(context))

bot.on("message", context => controllers.messageController.start(context))

controllers.commandController.listCommands().forEach((command) => {
  bot.command(command, context => controllers.commandController.start(command, context))
})

bot.use((context) => {
  controllers.memberController.start(context)
})

export { bot }
