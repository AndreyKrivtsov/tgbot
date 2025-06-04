import { startBot } from "./bot/bot.js"
import { Logger } from "./helpers/Logger.js"
import { Repository } from "./repository/Repository.js"
import { Web } from "./web/web.js"

const logger = new Logger("index")
const repository = new Repository(logger)
const bot = startBot(logger, repository)
const web = new Web(logger, repository)

web.start()

const signals = ["SIGINT", "SIGTERM"]

for (const signal of signals) {
  process.on(signal, async () => {
    await bot.stop()
    process.exit(0)
  })
}

process.on("uncaughtException", (error) => {
  logger.e("uncaughtException:", error)
})

process.on("unhandledRejection", (error) => {
  logger.e("unhandledRejection:", error)
})
