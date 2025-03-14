import type { MessageContext } from "gramio"
import { Bot } from "gramio"
import { loadHistory } from "services/aiService/history.js"
import { aiAnswerAction } from "./actions/aiAnswerAction.js"
import { answerAction } from "./actions/answerAction.js"
import { config } from "./config.js"
import { AI } from "./services/aiService/AI.js"
import { Llama } from "./services/llama/llama.js"
import { sheduleWeatherAction } from "./services/weather/weather.js"
import { Users } from "./utils/Users.js"

type LlamaParam = "maxTokens" | "temperature" | "minP" | "topK" | "topP" | "seed"
type AiBotParam = "maxOutputTokens" | "temperature" | "topK" | "topP" | "seed" | "frequencyPenalty"

const bot = new Bot(config.BOT_TOKEN)
const users = new Users()
const llama = new Llama()

const ai = new AI(config.AI_API_KEY)
ai.initModel("gemini-2.0-flash")

bot.onStart(({ info }) => {
  console.log(`\n\n ===== \n\n✨ Bot ${info.username} was started!\n\n Version 0.3 \n\n ===== \n\n`)

  sheduleWeatherAction((data) => {
    bot.api.sendPhoto({ chat_id: config.DEFAULT_CHAT_ID, photo: data })
  })
})

bot.command("start", context => context.send("Привет! Я бот Подслушано. Мне постоянно добавляют новые функции. Возможно, скоро, я смогу захватить мир."))

bot.command("context", (context) => {
  loadHistory("000000000").then((history) => {
    const fullHistory = history?.map(item => item.parts.map(part => part.text).join("")).join("").length
    if (fullHistory) {
      context.reply(fullHistory.toString())
    } else {
      context.reply("История пуста")
    }
  })
})

bot.command("contextText", (context) => {
  // llama.setContextText(context.text ?? "")
  // context.send(`Установлен текст:${context.text}`)
})

bot.command("maxTokens", (context) => {
  setParam(context)
})

bot.command("temperature", (context) => {
  setParam(context)
})

bot.command("topK", (context) => {
  setParam(context)
})

bot.command("topP", (context) => {
  setParam(context)
})

bot.command("seed", (context) => {
  setParam(context)
})

bot.command("reload", (context) => {
  ai.initModel()
})

bot.on("message", async (context) => {
  // console.log(context)
  aiAnswerAction({ bot, context, ai })
  answerAction({ bot, context, llama })
})

function setParam(context: MessageContext<Bot>) {
  const params = ["maxOutputTokens", "temperature", "topK", "topP", "seed"]
  const param = context.text?.replace("/", "").replace(/\s\d*/g, "")
  const value = Number(context.text?.replace(/\/\w+\s/g, ""))

  if (!param || !params.includes(param) || !Number.isInteger(value)) {
    context.reply(`Пустой параметр или значение. Передано: ${context.text}`)
    return
  }

  if (!(param in ai.config)) {
    context.reply("Нет такого параметра")
    return
  }

  ai.config[param as AiBotParam] = value
  context.reply(`Параметр "${param}" установлен в ${value}`)
}

export { bot }
