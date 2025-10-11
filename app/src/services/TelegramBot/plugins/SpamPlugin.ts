import type { Logger } from "../../../helpers/Logger.js"
import type { AntiSpamService } from "../../AntiSpamService/index.js"
import type { UserManager } from "../features/UserManager.js"
import { TelegramModerationAdapter } from "../adapters/ModerationAdapter.js"
import type { AppConfig } from "../../../config.js"
import { BaseMessagePlugin } from "./MessagePlugin.js"
import type { TelegramMessageContext } from "../types/index.js"
import { MessageFormatter } from "../utils/MessageFormatter.js"
import { getMessage } from "../utils/Messages.js"
import { BOT_CONFIG } from "../../../constants.js"

export class SpamPlugin extends BaseMessagePlugin {
  name = "SpamPlugin"
  priority = 2

  constructor(
    private logger: Logger,
    private antiSpamService: AntiSpamService,
    private userManager: UserManager,
    private moderation: TelegramModerationAdapter,
    private config: AppConfig,
  ) {
    super()
  }

  canHandle(context: TelegramMessageContext): boolean {
    return Boolean(context.text && !context.text.startsWith("/"))
  }

  async handle(context: TelegramMessageContext): Promise<boolean> {
    const { from, text, chat } = context
    if (!from || !text || !chat)
      return false

    const userCounter = await this.userManager.getUserOrCreate(from.id, from.username, from.firstName)
    const spamResult = await this.antiSpamService.checkMessage(from.id, text)

    if (spamResult.isSpam) {
      this.userManager.incrementSpamCounter(from.id)

      if (context.id) {
        await this.moderation.deleteMessage(chat.id, context.id)
      }

      if (userCounter.spamCount < 2) {
        await this.sendSpamWarning(chat.id, userCounter.firstName || from.firstName || "Unknown", userCounter.spamCount, userCounter.username || from.username)
      } else {
        await this.kickUserForSpam(chat.id, from.id, userCounter.firstName || from.firstName || "Unknown", userCounter.username || from.username)
      }
    }

    return false
  }

  private async sendSpamWarning(chatId: number, firstName: string, count: number, username?: string): Promise<void> {
    const name = MessageFormatter.escapeMarkdownV2(firstName)
    const admin = this.config.ADMIN_USERNAME ? MessageFormatter.escapeMarkdownV2(this.config.ADMIN_USERNAME) : ""
    const modifier = count > 1 ? "Повторное c" : ""
    const warningText = getMessage("spam_warning", { modifier, name, admin })

    await this.moderation.sendGroupMessage(chatId, warningText, "MarkdownV2")
  }

  private async kickUserForSpam(chatId: number, userId: number, firstName: string, username?: string): Promise<void> {
    const name = MessageFormatter.escapeMarkdownV2(firstName)
    const admin = this.config.ADMIN_USERNAME ? MessageFormatter.escapeMarkdownV2(this.config.ADMIN_USERNAME) : ""
    const kickText = getMessage("spam_kick", { name, admin })

    await this.moderation.sendGroupMessage(chatId, kickText, "MarkdownV2")
    await this.moderation.kickUser(chatId, userId, firstName)
    this.userManager.clearUserCounter(userId)
  }
}
