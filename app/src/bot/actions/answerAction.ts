import type { Bot, MessageContext } from "gramio"
import type { Llama } from "../../services/llama/llama.js"
import { config } from "../../config.js"

interface AnswerArgs {
  bot: Bot
  context: MessageContext<Bot>
  llama: Llama
}

export async function answerAction({ bot, context, llama }: AnswerArgs) {
  const defaultContextId = "abcdeabcde"
  const userId = context.from?.id
  const text = context.text
  const isBot = context.from?.isBot()

  if (!text || !userId || isBot) {
    return
  }

  const regexpCall = /Эй\s{0,3}старый\s{0,3}бот\W*/i
  const regexpQuestion = /Эй\s{0,3}старый\s{0,3}бот.+/i
  const regexpForReplace = /Эй\s{0,3}старый\s{0,3}бот/i

  const isCall = regexpCall.test(text)
  const isQuestion = regexpQuestion.test(text)
  let question = ""

  if (isCall) {
    if (!isQuestion) {
      question = text
    } else {
      question = text.replace(regexpForReplace, "")
    }

    // defaultContextId as user.sessionId
    const answer = await askLlama(bot, llama, defaultContextId, question)

    if (answer && !answer.error) {
      bot.api.sendMessage({ chat_id: config.DEFAULT_CHAT_ID, text: answer.message, reply_parameters: { message_id: context.id } })
    }
  }
}

async function askLlama(bot: Bot, llama: Llama, sessionId: string, question: string) {
  if (!question) {
    return
  }

  const interval = setInterval(() => {
    bot.api.sendChatAction({ chat_id: config.DEFAULT_CHAT_ID, action: "typing" })
  }, 3000)

  const answer = await llama.answer(sessionId, question)

  clearInterval(interval)

  return answer
}
