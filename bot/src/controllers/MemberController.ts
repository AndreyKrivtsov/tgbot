import type { Bot, CallbackQueryContext, LeftChatMemberContext, MaybeSuppressedParams, NewChatMembersContext, TelegramChatPermissions, User } from "gramio"
import { InlineKeyboard } from "gramio"
import { getCaptcha } from "../helpers/getCaptcha.js"

interface RestrictedUser {
  userId: number
  chatId: number
  questionId: number
  answer: number
  username?: string
  firstname: string
  timestamp: number
  isAnswered: boolean
}

export class MemberController {
  bot: Bot
  restrictedUsers: Record<number, RestrictedUser> = {}
  isWaiting: boolean = false

  /**
   *
   * @param bot
   */
  constructor(bot: Bot) {
    this.bot = bot
    this.bot.on("callback_query", context => this.answerCallback(context))
  }

  /**
   *
   * @param context
   */
  async newMember(context: NewChatMembersContext<Bot>) {
    await this.clearMessage(context.chat.id, context.id)

    const chat = context.chat
    const users = context.newChatMembers

    users?.forEach(async (user) => {
      const { question, answer, options } = getCaptcha()
      const questionId = await this.sendKeyboard(user, chat.id, question, options)
      this.addRestrictedUser(user, chat.id, questionId, answer)
      await this.muteUser(chat.id, user.id)
      await this.waitingUsers()
    })
  }

  /**
   *
   * @param context
   */
  leftMember(context: LeftChatMemberContext<Bot>) {
    this.clearMessage(context.chat.id, context.id)
  }

  async checkMember() {

  }

  /**
   *
   * @param context
   */
  async answerCallback(context: CallbackQueryContext<Bot>) {
    const user = {
      userId: context.senderId,
      questionId: context.message?.id,
      answer: context.queryPayload,
    }

    const restrictedUser = this.restrictedUsers[user.userId]

    if (restrictedUser && !restrictedUser.isAnswered) {
      restrictedUser.isAnswered = true

      if (restrictedUser.questionId === user.questionId && restrictedUser.answer === user.answer) {
        await this.unmuteUser(restrictedUser.chatId, restrictedUser.userId)
      } else {
        await this.temporaryBanUser(restrictedUser.chatId, restrictedUser.userId)
        this.sendFailMessage(restrictedUser.username, restrictedUser.firstname, restrictedUser.chatId)
      }

      this.deleteRestrictedUser(restrictedUser.userId)
      await this.clearMessage(restrictedUser.chatId, restrictedUser.questionId)
    }
  }

  /**
   *
   * @returns {Promise<void>}
   */
  async waitingUsers(): Promise<void> {
    console.log("waiting")
    if (this.isWaiting)
      return

    this.isWaiting = true

    const timeForTest = 60000
    const restrictedUsers = Object.values(this.restrictedUsers)

    if (!restrictedUsers.length)
      return

    restrictedUsers.forEach(async (user) => {
      const now = Date.now()
      if (now > user.timestamp + timeForTest) {
        console.log("check", user.userId, user.timestamp, now)
        await this.clearMessage(user.chatId, user.questionId)
        this.temporaryBanUser(user.chatId, user.userId)
        this.deleteRestrictedUser(user.userId)
        this.sendTimeoutMessage(user.username, user.firstname, user.chatId)
      }
    })

    setTimeout(() => {
      this.isWaiting = false
      this.waitingUsers()
    }, 5000)
  }

  /**
   *
   * @param userId
   * @param chatId
   * @param questionId
   * @param answer
   */
  addRestrictedUser(user: User, chatId: number, questionId: number, answer: number) {
    this.restrictedUsers[user.id] = {
      userId: user.id,
      chatId,
      questionId,
      answer,
      username: user.username,
      firstname: user.firstName,
      timestamp: Date.now(),
      isAnswered: false,
    }
  }

  /**
   *
   * @param userId
   */
  deleteRestrictedUser(userId: number) {
    delete this.restrictedUsers[userId]
  }

  /**
   *
   * @param chatId
   * @param userId
   * @param answer
   * @param questionId
   */
  async muteUser(chatId: number, userId: number) {
    this.bot.api.restrictChatMember({ user_id: userId, chat_id: chatId, permissions: this.restrictOptions(false) })
  }

  /**
   *
   * @param chatId
   * @param userId
   */
  async unmuteUser(chatId: number, userId: number) {
    await this.bot.api.restrictChatMember({ permissions: this.restrictOptions(true), chat_id: chatId, user_id: userId })
  }

  /**
   *
   * @param chatId
   * @param userId
   */
  async temporaryBanUser(chatId: number, userId: number) {
    const unixTimestamp = Math.floor(Date.now() / 1000)
    await this.bot.api.banChatMember({ chat_id: chatId, user_id: userId, until_date: unixTimestamp + 40 })
    setTimeout(() => {
      this.bot.api.unbanChatMember({ chat_id: chatId, user_id: userId })
    }, 5000)
  }

  /**
   *
   * @param username
   * @param firstname
   * @param chatId
   */
  async sendTimeoutMessage(username: string | undefined, firstname: string, chatId: number) {
    const name = username ? `@${username}` : firstname
    const text = `К сожалению, ${name} не выбрал ни один вариант ответа 🧐`
    const messageResult = await this.sendMessage(text, chatId)

    setTimeout(() => {
      this.clearMessage(chatId, messageResult.message_id)
    }, 60000)
  }

  /**
   *
   * @param username
   * @param firstname
   * @param chatId
   */
  async sendFailMessage(username: string | undefined, firstname: string, chatId: number) {
    const name = username ? `@${username}` : firstname
    const text = `К сожалению, ${name} выбрал неправильный вариант ответа 😢`
    const messageResult = await this.sendMessage(text, chatId)

    setTimeout(() => {
      this.clearMessage(chatId, messageResult.message_id)
    }, 60000)
  }

  /**
   *
   * @param chatId
   * @param messageId
   */
  async clearMessage(chatId: number, messageId: number) {
    await this.bot.api.deleteMessage({ chat_id: chatId, message_id: messageId })
  }

  /**
   *
   * @param user
   * @param chatId
   * @param question
   * @param options
   * @returns {Promise<number>}
   */
  async sendKeyboard(user: User, chatId: number, question: number[], options: number[]): Promise<number> {
    const text = this.getText(user.username, user.firstName, question[0] as number, question[1] as number)

    const keyboard = this.getKeyboard(options)
    const keyboardResult = await this.sendMessage(text, chatId, keyboard)
    return keyboardResult.message_id
  }

  /**
   *
   * @param text
   * @param chatId
   * @param keyboard
   * @returns
   */
  sendMessage(text: string, chatId: number, keyboard?: InlineKeyboard) {
    const params: MaybeSuppressedParams<"sendMessage", undefined> = {
      text,
      chat_id: chatId,
      parse_mode: "HTML",
      disable_notification: true,
    }

    if (keyboard) {
      params.reply_markup = keyboard
    }

    return this.bot.api.sendMessage(params)
  }

  /**
   *
   * @param username
   * @param firstName
   * @param q1
   * @param q2
   * @returns
   */
  getText(username: string | undefined, firstName: string, q1: number, q2: number) {
    let text = username ? `@${username}\n` : ""
    text += `<b>${firstName}</b>, добро пожаловать!\n`
    text += "Пожалуйста, пройдите простую проверку:\n\n"
    text += `- Сколько будет ${q1} + ${q2}?`
    text += "\n\n<i>Если у вас возникли проблемы - @TH_True_Milk</i>"
    return text
  }

  /**
   *
   * @param options
   * @returns {InlineKeyboard}
   */
  getKeyboard(options: number[]): InlineKeyboard {
    const keyboard = new InlineKeyboard()

    options.forEach((option) => {
      keyboard.text(option.toString(), option.toString())
    })

    return keyboard
  }

  /**
   *
   * @param value
   * @returns {TelegramChatPermissions}
   */
  restrictOptions(value: boolean): TelegramChatPermissions {
    return {
      can_send_messages: value,
      can_send_photos: value,
      can_send_audios: value,
      can_send_videos: value,
      can_send_voice_notes: value,
      can_send_video_notes: value,
      can_send_documents: value,
      can_send_polls: value,
    }
  }
}
