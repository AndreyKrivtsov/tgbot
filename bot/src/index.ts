import { bot } from "./bot.js"
import { Log } from "./helpers/Log.js"

const log = new Log("index.js")

const signals = ["SIGINT", "SIGTERM"]

for (const signal of signals) {
  process.on(signal, async () => {
    await bot.stop()
    process.exit(0)
  })
}

process.on("uncaughtException", (error) => {
  log.e("uncaughtException:", error)
})

process.on("unhandledRejection", (error) => {
  log.e("unhandledRejection:", error)
})

async function botStart() {
  try {
    await bot.start()
    log.i("Bot started")
  } catch (e) {
    log.e(e)
    setTimeout(() => {
      botStart()
    }, 5000)
  }
}

botStart()
