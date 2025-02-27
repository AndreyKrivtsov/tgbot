import type { Bot, MessageContext } from "gramio"
import type { Llama } from "../services/llama/llama.js"
import type { Users } from "../utils/Users.js"
import { config } from "../config.js"

export async function answerAction(bot: Bot, llama: Llama, users: Users, context: MessageContext<Bot>) {
  const defaultContextId = "abcdeabcde"
  const userId = context.from?.id
  const text = context.text
  const isBot = context.from?.isBot()

  if (!text || !userId || isBot) {
    return
  }

  let user = users.getUser(userId)

  if (!user) {
    user = users.newUser(userId)
  }

  const regexpCall = /Эй.{0,3}бот\W*/i
  const regexpQuestion = /Эй.{0,3}бот.+/i
  const regexpForReplace = /Эй.{0,3}бот/i

  const isCall = regexpCall.test(text)
  const isQuestion = regexpQuestion.test(text)

  if (isCall) {
    if (!isQuestion) {
      await askLlama(bot, llama, defaultContextId, text)
      // await askLlama(bot, user.sessionId, text)
    } else {
      const parseQuestion = text.replace(regexpForReplace, "")
      await askLlama(bot, llama, defaultContextId, parseQuestion)
      // await askLlama(bot, user.sessionId, parseQuestion)
    }
  }
}

async function askLlama(bot: Bot, llama: Llama, sessionId: string, question: string) {
  console.log("Bot question", question)
  if (!question) {
    return
  }

  // const extendQuestions = [
  //   "",
  //   "Сформулируй свой ответ в два или три предложения. Тебе задали следующий вопрос:\n",
  //   "Ты бот помощник в большом чате. К тебе могут обращаться совершенно разные люди. Отвечай им грубо. Ответь мне на следующий вопрос:",
  //   "Ты милая девушка. Ты стесьняешься. Ответь мне на следующий вопрос:",
  // ]
  // const extendQuestion = `${extendQuestions[3]}${question}`

  const interval = setInterval(() => {
    bot.api.sendChatAction({ chat_id: config.DEFAULT_CHAT_ID, action: "typing" })
  }, 3000)

  const answer = await llama.answer(sessionId, question)

  clearInterval(interval)

  if (answer && !answer.error) {
    bot.api.sendMessage({ chat_id: config.DEFAULT_CHAT_ID, text: answer.message })
  }
}
