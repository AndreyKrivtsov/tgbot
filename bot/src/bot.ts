import { Bot } from "gramio"
import { answerAction } from "./actions/answerAction.js"
import { config } from "./config.js"
import { Llama } from "./services/llama/llama.js"
import { sheduleWeatherAction } from "./services/weather/weather.js"
import { Users } from "./utils/Users.js"

type LlamaParam = 'maxTokens' | 'temperature' | 'minP' | 'topK' | 'topP' | 'seed'

const bot = new Bot(config.BOT_TOKEN)
const users = new Users()
const llama = new Llama()

bot.onStart(({ info }) => {
  console.log(`\n\n ===== \n\n✨ Bot ${info.username} was started!\n\n ===== \n\n`)

  sheduleWeatherAction((data) => {
    bot.api.sendPhoto({ chat_id: config.DEFAULT_CHAT_ID, photo: data })
  })
})

bot.command("start", context => context.send("Привет! Я бот Подслушано. Мне постоянно добавляют новые функции. Возможно, скоро, я смогу захватить мир."))

bot.command("contextText", context => {
  const contextText = context.text?.replace(/\/\w+\s/gi, "")
  llama.setContextText(contextText ?? "")
  context.send("Установлен текст:" + contextText)
})

bot.command("maxTokens", context => {
  const param = context.text
  const reply = setParam('maxTokens', param)
  if (reply) {
    context.send(reply)
  }
})

bot.command("temperature", context => {
  const param = context.text
  const reply = setParam('temperature', param)
  if (reply) {
    context.send(reply)
  }
})

bot.command("minP", context => {
  const param = context.text
  const reply = setParam('minP', param)
  if (reply) {
    context.send(reply)
  }
})

bot.command("topK", context => {
  const param = context.text
  const reply = setParam('topK', param)
  if (reply) {
    context.send(reply)
  }
})

bot.command("topP", context => {
  const param = context.text
  const reply = setParam('topP', param)
  if (reply) {
    context.send(reply)
  }
})

bot.command("seed", context => {
  const param = context.text
  const reply = setParam('seed', param)
  if (reply) {
    context.send(reply)
  }
})

bot.on("message", async (context) => {
  console.log(context)
  if (context.chat.id !== config.DEFAULT_CHAT_ID) {
    return
  }

  answerAction(bot, llama, users, context)
})

function setParam(name: LlamaParam, value: string | undefined) {
  if (!value) {
    return 'Пустой параметр'
  }

  const param = Number(value?.replace(/\/\w+\s/gi, ""))

  if (!(name in llama.params)) {
    return 'Нет такого параметра'
  }

  if (!Number.isNaN(param)) {
    llama.params[name] = param
    return `Параметр "${name}" установлен в ${param}`
  } else {
    return 'Неправильный формат параметра'
  }
}

export { bot }
