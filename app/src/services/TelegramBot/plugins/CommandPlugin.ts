import type { Logger } from "../../../helpers/Logger.js"
import type { CommandHandler } from "../handlers/CommandHandler.js"
import { BaseMessagePlugin } from "./MessagePlugin.js"
import type { TelegramMessageContext } from "../types/index.js"

export class CommandPlugin extends BaseMessagePlugin {
  name = "CommandPlugin"
  priority = 1

  constructor(
    private logger: Logger,
    private commandHandler: CommandHandler,
  ) {
    super()
  }

  canHandle(context: TelegramMessageContext): boolean {
    return Boolean(context.text?.startsWith("/"))
  }

  async handle(context: TelegramMessageContext): Promise<boolean> {
    await this.commandHandler.handleCommand(context)
    return true
  }
}
