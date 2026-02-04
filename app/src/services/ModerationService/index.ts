import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { BanUserCommand, EventBus, MuteUserCommand, TelegramAction, UnbanUserCommand, UnmuteUserCommand } from "../../core/EventBus.js"
import { EVENTS } from "../../core/EventBus.js"
import type { AuthorizationService } from "../AuthorizationService/index.js"
import { getMessage } from "../../shared/messages/index.js"

interface TelegramPort {
  getChatMember: (params: { chat_id: number, user_id: number | string }) => Promise<any>
}

interface ModerationDependencies {
  eventBus?: EventBus
  authorizationService?: AuthorizationService
  telegramPort?: TelegramPort
}

export class ModerationService implements IService {
  private config: AppConfig
  private logger: Logger
  private deps: ModerationDependencies

  constructor(config: AppConfig, logger: Logger, deps: ModerationDependencies = {}) {
    this.config = config
    this.logger = logger
    this.deps = deps
  }

  async initialize(): Promise<void> {
    if (!this.deps.eventBus)
      return
    const bus = this.deps.eventBus

    bus.onCommandBan(async (cmd: BanUserCommand) => {
      await this.handleBan(cmd)
    })

    bus.onCommandUnban(async (cmd: UnbanUserCommand) => {
      await this.handleUnban(cmd)
    })

    bus.onCommandMute(async (cmd: MuteUserCommand) => {
      await this.handleMute(cmd)
    })

    bus.onCommandUnmute(async (cmd: UnmuteUserCommand) => {
      await this.handleUnmute(cmd)
    })
  }

  private async handleBan(cmd: BanUserCommand): Promise<void> {
    const { actorId, chatId, messageId, target, actorUsername } = cmd

    if (chatId >= 0) {
      await this.sendMessage(chatId, getMessage("register_groups_only"), messageId)
      return
    }

    if (!this.deps.authorizationService) {
      return
    }

    const resolvedActorUsername = actorUsername || await this.getActorUsername(actorId, chatId)
    const authResult = await this.deps.authorizationService.checkGroupAdmin(chatId, actorId, resolvedActorUsername)

    if (!authResult.authorized) {
      const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
      await this.sendMessage(chatId, getMessage(reasonKey), messageId)
      return
    }

    try {
      const targetInfo = await this.resolveTarget(chatId, target)
      if (!targetInfo) {
        await this.sendMessage(chatId, getMessage("ban_specify_user"), messageId)
        return
      }

      if (!targetInfo.userId) {
        await this.sendMessage(chatId, getMessage("ban_user_not_found", { username: targetInfo.username || "unknown" }), messageId)
        return
      }

      const actions: TelegramAction[] = []
      if (messageId) {
        actions.push({
          type: "deleteMessage",
          params: { messageId },
        })
      }

      actions.push({
        type: "kick",
        params: {
          userId: targetInfo.userId,
        },
      })

      actions.push({
        type: "sendMessage",
        params: {
          text: getMessage("ban_success", { username: targetInfo.username || "user" }),
        },
      })

      await this.deps.eventBus!.emitAIResponse({
        chatId,
        text: getMessage("ban_success", { username: targetInfo.username || "user" }),
        actions,
      })

      this.logger.i(`User ${targetInfo.userId} (${targetInfo.username}) banned by admin`)
    } catch (error) {
      this.logger.e("Error in ban command:", error)
      await this.sendMessage(chatId, getMessage("ban_error"), messageId)
    }
  }

  private async handleUnban(cmd: UnbanUserCommand): Promise<void> {
    const { actorId, chatId, messageId, target, actorUsername } = cmd

    if (chatId >= 0) {
      await this.sendMessage(chatId, getMessage("register_groups_only"), messageId)
      return
    }

    if (!this.deps.authorizationService) {
      return
    }

    const resolvedActorUsername = actorUsername || await this.getActorUsername(actorId, chatId)
    const authResult = await this.deps.authorizationService.checkGroupAdmin(chatId, actorId, resolvedActorUsername)

    if (!authResult.authorized) {
      const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
      await this.sendMessage(chatId, getMessage(reasonKey), messageId)
      return
    }

    try {
      const targetInfo = await this.resolveTarget(chatId, target)
      if (!targetInfo) {
        await this.sendMessage(chatId, getMessage("ban_specify_user"), messageId)
        return
      }

      if (!targetInfo.userId) {
        await this.sendMessage(chatId, getMessage("ban_user_not_found", { username: targetInfo.username || "unknown" }), messageId)
        return
      }

      const actions: TelegramAction[] = []
      if (messageId) {
        actions.push({
          type: "deleteMessage",
          params: { messageId },
        })
      }

      actions.push({
        type: "unban",
        params: {
          userId: targetInfo.userId,
        },
      })

      actions.push({
        type: "sendMessage",
        params: {
          text: getMessage("unban_success", { username: targetInfo.username || "user" }),
        },
      })

      await this.deps.eventBus!.emitAIResponse({
        chatId,
        text: getMessage("unban_success", { username: targetInfo.username || "user" }),
        actions,
      })

      this.logger.i(`User ${targetInfo.userId} (${targetInfo.username}) unbanned by admin`)
    } catch (error) {
      this.logger.e("Error in unban command:", error)
      await this.sendMessage(chatId, getMessage("unban_error"), messageId)
    }
  }

  private async handleMute(cmd: MuteUserCommand): Promise<void> {
    const { actorId, chatId, messageId, target, actorUsername } = cmd

    if (chatId >= 0) {
      await this.sendMessage(chatId, getMessage("register_groups_only"), messageId)
      return
    }

    if (!this.deps.authorizationService) {
      return
    }

    const resolvedActorUsername = actorUsername || await this.getActorUsername(actorId, chatId)
    const authResult = await this.deps.authorizationService.checkGroupAdmin(chatId, actorId, resolvedActorUsername)

    if (!authResult.authorized) {
      const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
      await this.sendMessage(chatId, getMessage(reasonKey), messageId)
      return
    }

    try {
      const targetInfo = await this.resolveTarget(chatId, target)
      if (!targetInfo) {
        await this.sendMessage(chatId, getMessage("ban_specify_user"), messageId)
        return
      }

      if (!targetInfo.userId) {
        await this.sendMessage(chatId, getMessage("ban_user_not_found", { username: targetInfo.username || "unknown" }), messageId)
        return
      }

      const isMember = await this.checkIsMember(chatId, targetInfo.userId)
      if (!isMember) {
        await this.sendMessage(chatId, getMessage("ban_user_not_found", { username: targetInfo.username || "unknown" }), messageId)
        return
      }

      const actions: TelegramAction[] = []
      if (messageId) {
        actions.push({
          type: "deleteMessage",
          params: { messageId },
        })
      }

      actions.push({
        type: "restrict",
        params: {
          userId: targetInfo.userId,
          permissions: "none",
        },
      })

      actions.push({
        type: "sendMessage",
        params: {
          text: getMessage("mute_success", { username: targetInfo.username || "user" }),
        },
      })

      await this.deps.eventBus!.emitAIResponse({
        chatId,
        text: getMessage("mute_success", { username: targetInfo.username || "user" }),
        actions,
      })

      this.logger.i(`User ${targetInfo.userId} (${targetInfo.username}) muted by admin`)
    } catch (error) {
      this.logger.e("Error in mute command:", error)
      await this.sendMessage(chatId, getMessage("mute_error"), messageId)
    }
  }

  private async handleUnmute(cmd: UnmuteUserCommand): Promise<void> {
    const { actorId, chatId, messageId, target, actorUsername } = cmd

    if (chatId >= 0) {
      await this.sendMessage(chatId, getMessage("register_groups_only"), messageId)
      return
    }

    if (!this.deps.authorizationService) {
      return
    }

    const resolvedActorUsername = actorUsername || await this.getActorUsername(actorId, chatId)
    const authResult = await this.deps.authorizationService.checkGroupAdmin(chatId, actorId, resolvedActorUsername)

    if (!authResult.authorized) {
      const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
      await this.sendMessage(chatId, getMessage(reasonKey), messageId)
      return
    }

    try {
      const targetInfo = await this.resolveTarget(chatId, target)
      if (!targetInfo) {
        await this.sendMessage(chatId, getMessage("ban_specify_user"), messageId)
        return
      }

      if (!targetInfo.userId) {
        await this.sendMessage(chatId, getMessage("ban_user_not_found", { username: targetInfo.username || "unknown" }), messageId)
        return
      }

      const isMember = await this.checkIsMember(chatId, targetInfo.userId)
      if (!isMember) {
        await this.sendMessage(chatId, getMessage("ban_user_not_found", { username: targetInfo.username || "unknown" }), messageId)
        return
      }

      const actions: TelegramAction[] = []
      if (messageId) {
        actions.push({
          type: "deleteMessage",
          params: { messageId },
        })
      }

      actions.push({
        type: "unrestrict",
        params: {
          userId: targetInfo.userId,
          permissions: "full",
        },
      })

      actions.push({
        type: "sendMessage",
        params: {
          text: getMessage("unmute_success", { username: targetInfo.username || "user" }),
        },
      })

      await this.deps.eventBus!.emitAIResponse({
        chatId,
        text: getMessage("unmute_success", { username: targetInfo.username || "user" }),
        actions,
      })

      this.logger.i(`User ${targetInfo.userId} (${targetInfo.username}) unmuted by admin`)
    } catch (error) {
      this.logger.e("Error in unmute command:", error)
      await this.sendMessage(chatId, getMessage("unmute_error"), messageId)
    }
  }

  private async resolveTarget(chatId: number, target: { userId?: number, username?: string }): Promise<{ userId: number | null, username: string } | null> {
    if (target.userId) {
      return { userId: target.userId, username: target.username || "user" }
    }

    if (target.username && this.deps.telegramPort) {
      try {
        const member = await this.deps.telegramPort.getChatMember({
          chat_id: chatId,
          user_id: `@${target.username}`,
        })
        if (member && member.user && member.user.id) {
          return {
            userId: member.user.id,
            username: member.user.username || target.username,
          }
        }
      } catch {
        return { userId: null, username: target.username }
      }
    }

    return null
  }

  private async checkIsMember(chatId: number, userId: number): Promise<boolean> {
    if (!this.deps.telegramPort) {
      return false
    }

    try {
      const member = await this.deps.telegramPort.getChatMember({
        chat_id: chatId,
        user_id: userId,
      })
      return member && member.user && member.user.id === userId
    } catch {
      return false
    }
  }

  private async getActorUsername(userId: number, chatId: number): Promise<string | undefined> {
    // Получаем username через Telegram API если нужно
    if (this.deps.telegramPort) {
      try {
        const member = await this.deps.telegramPort.getChatMember({
          chat_id: chatId,
          user_id: userId,
        })
        return member?.user?.username
      } catch {
        return undefined
      }
    }
    return undefined
  }

  private async sendMessage(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    if (!this.deps.eventBus)
      return

    const actions: TelegramAction[] = []

    if (replyToMessageId) {
      actions.push({
        type: "deleteMessage",
        params: { messageId: replyToMessageId },
      })
    }

    actions.push({
      type: "sendMessage",
      params: {
        text,
      },
    })

    await this.deps.eventBus.emitAIResponse({
      chatId,
      text,
      actions,
    })
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async dispose(): Promise<void> {}
  isHealthy(): boolean { return true }
}
