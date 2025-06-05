import type { APIMethods, MaybeArray, SuppressedAPIMethods, UpdateName } from "gramio"
import { Bot as GramioBot } from "gramio"

/**
 * Bot API types
 */

export {
  CallbackQueryContext,
  ChatMember,
  ChatMemberContext,
  Context,
  InlineKeyboard,
  LeftChatMemberContext,
  MaybeSuppressedParams,
  NewChatMembersContext,
  TelegramChatPermissions,
  User,
} from "gramio"

export class Bot {
  private bot: GramioBot

  constructor(botToken: string) {
    this.bot = new GramioBot(botToken)
  }

  get info() {
    return this.bot.info
  }

  get api(): SuppressedAPIMethods<keyof APIMethods> {
    return this.bot.api
  }

  get __Derives() {
    return this.bot.__Derives
  }

  get downloadFile() {
    return this.bot.downloadFile.bind(this.bot)
  }

  onStart(callback: () => void) {
    this.bot.onStart(callback)
  }

  on(event: MaybeArray<UpdateName>, callback: (context: any) => void) {
    this.bot.on(event, callback)
  }

  command(command: string, callback: (context: any) => void) {
    this.bot.command(command, callback)
  }

  use(callback: (context: any) => void) {
    this.bot.use(callback)
  }

  start() {
    this.bot.start()
  }

  stop() {
    this.bot.stop()
  }
}
