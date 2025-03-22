import type { Bot, MessageContext } from "gramio"
import type { AI } from "../services/aiService/AI.js"
import { config } from "../config.js"
import { Log } from "../helpers/Log.js"
import { MessageQueue } from "../helpers/MessageQueue.js"

interface ActionArgs {
  bot: Bot
  context: MessageContext<Bot>
  ai: AI
}

const log = new Log("aiAnswerAction.ts")

let isWorking = false

let isQueueStarted = false
const queue = new MessageQueue()

export async function aiAnswerAction({ bot, context, ai }: ActionArgs) {
  if (context.chat.id === config.DEFAULT_CHAT_ID) {
    const defaultContextId = "000000000"
    const message = getBotMessage(bot, context)

    if (!message) {
      return
    }

    if (queue.length() < 8) {
      queue.set(context.id, message, defaultContextId)
    } else {
      context.reply("Слишком много сообщений в моей памяти ждут ответа. Вы можете спросить меня сразу после того, как я отвечу на предыдущее сообщение. Спасибо ;)")
    }

    if (!isQueueStarted) {
      isQueueStarted = true
      startQueue(bot, ai, queue)
    }
  }
}

async function startQueue(bot: Bot, ai: AI, queue: MessageQueue) {
  try {
    const queueItem = queue.get()

    if (queueItem) {
      const { id, message, contextId } = queueItem

      const interval = setInterval(() => {
        bot.api.sendChatAction({ chat_id: config.DEFAULT_CHAT_ID, action: "typing" })
      }, 3000)

      const responce = await throttleQuery(ai.request(contextId, message), config.AI_API_THROTTLE)

      if (responce) {
        bot.api.sendMessage({ chat_id: config.DEFAULT_CHAT_ID, text: responce, reply_parameters: { message_id: id } })
      }

      clearInterval(interval)
    }

    setTimeout(() => {
      startQueue(bot, ai, queue)
    }, 1000)
  } catch (e) {
    log.e(e)
    setTimeout(() => {
      startQueue(bot, ai, queue)
    }, 1000)
  }
}

async function throttleQuery(requestFunction: Promise<string>, pause: number): Promise<string> {
  return new Promise((resolve) => {
    if (!isWorking) {
      isWorking = true

      try {
        requestFunction.then((responce) => {
          if (responce) {
            setTimeout(() => {
              isWorking = false
              resolve(responce)
            }, pause)
          } else {
            resolve("")
          }
        })
      } catch (e) {
        log.e(e)
      }
    } else {
      resolve("")
    }
  })
}

function getBotMessage(bot: Bot, context: MessageContext<Bot>) {
  let messageForBot = ""
  const date = new Date()
  const messageDate = date.toISOString().replace(/:\d+\.\d+Z/gi, "").replace("T", " ")
  const prependMessage = `[${messageDate}][@${context.from?.username}][${context.from?.firstName}] пользователь спрашивает тебя: `
  const regexp = /^эй.{0,3}бот\W?.*/i
  const regexpReplace = /^Эй.{0,3}бот\W?/i
  const regexp2 = /^альтрон.*/gi

  if (context.text && context.from && !context.from.isBot()) {
    const botUserName = `@${bot.info?.username}`

    if (context.text.startsWith(botUserName)) {
      messageForBot = prependMessage + context.text.replace(botUserName, "")
    } else if ("replyMessage" in context && context.replyMessage?.from?.username === bot.info?.username) {
      messageForBot = prependMessage + context.text
    } else if (regexp.test(context.text)) {
      messageForBot = prependMessage + context.text.replace(regexpReplace, "")
    } else if (regexp2.test(context.text)) {
      messageForBot = prependMessage + context.text
    }
  }

  return messageForBot.trim()
}
