import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { EventBus, RegisterGroupCommand, TelegramAction, UnregisterGroupCommand } from "../../core/EventBus.js"
import { EVENTS } from "../../core/EventBus.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import type { AuthorizationService } from "../AuthorizationService/index.js"
import { getMessage } from "../../shared/messages/index.js"

interface TelegramPort {
  getChatAdministrators: (chatId: number) => Promise<any[]>
}

interface GroupManagementDependencies {
  eventBus?: EventBus
  chatRepository?: ChatRepository
  authorizationService?: AuthorizationService
  telegramPort?: TelegramPort
}

export class GroupManagementService implements IService {
  private config: AppConfig
  private logger: Logger
  private deps: GroupManagementDependencies

  constructor(config: AppConfig, logger: Logger, deps: GroupManagementDependencies = {}) {
    this.config = config
    this.logger = logger
    this.deps = deps
  }

  async initialize(): Promise<void> {
    if (!this.deps.eventBus)
      return
    const bus = this.deps.eventBus

    bus.onCommandRegister(async (cmd: RegisterGroupCommand) => {
      await this.handleRegister(cmd)
    })

    bus.onCommandUnregister(async (cmd: UnregisterGroupCommand) => {
      await this.handleUnregister(cmd)
    })
  }

  private async handleRegister(cmd: RegisterGroupCommand): Promise<void> {
    const { actorId, chatId, messageId, actorUsername, chatTitle } = cmd

    if (chatId >= 0) {
      await this.sendMessage(chatId, getMessage("register_groups_only"), messageId)
      return
    }

    if (!this.deps.chatRepository || !this.deps.authorizationService) {
      return
    }

    const authResult = await this.deps.authorizationService.checkGroupAdmin(chatId, actorId, actorUsername)

    if (!authResult.authorized) {
      const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
      await this.sendMessage(chatId, getMessage(reasonKey), messageId)
      return
    }

    const existingChat = await this.deps.chatRepository.getChat(chatId)
    if (!existingChat) {
      await this.updateGroupAdmins(chatId)
    }

    try {
      const result = await this.deps.chatRepository.registerChat(chatId, chatTitle || "Unknown Group")

      if (result.success) {
        await this.sendMessage(chatId, getMessage("register_success"), messageId)
        this.logger.i(`Chat ${chatId} registered successfully`)
      } else {
        await this.sendMessage(chatId, `❌ ${result.message}`, messageId)
      }
    } catch (error) {
      this.logger.e("Error registering chat:", error)
      await this.sendMessage(chatId, getMessage("register_error"), messageId)
    }
  }

  private async handleUnregister(cmd: UnregisterGroupCommand): Promise<void> {
    const { actorId, chatId, messageId, actorUsername } = cmd

    if (chatId >= 0) {
      await this.sendMessage(chatId, getMessage("register_groups_only"), messageId)
      return
    }

    if (!this.deps.chatRepository || !this.deps.authorizationService) {
      return
    }

    const authResult = await this.deps.authorizationService.checkGroupAdmin(chatId, actorId, actorUsername)

    if (!authResult.authorized) {
      const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
      await this.sendMessage(chatId, getMessage(reasonKey), messageId)
      return
    }

    try {
      const result = await this.deps.chatRepository.unregisterChat(chatId)

      if (result.success) {
        await this.sendMessage(chatId, getMessage("unregister_success"), messageId)
        this.logger.i(`Chat ${chatId} unregistered successfully`)
      } else {
        await this.sendMessage(chatId, `❌ ${result.message}`, messageId)
      }
    } catch (error) {
      this.logger.e("Error unregistering chat:", error)
      await this.sendMessage(chatId, getMessage("unregister_error"), messageId)
    }
  }

  async updateGroupAdmins(chatId: number): Promise<void> {
    if (!this.deps.telegramPort || !this.deps.chatRepository) {
      return
    }

    try {
      const admins = await this.deps.telegramPort.getChatAdministrators(chatId)
      if (!Array.isArray(admins)) {
        return
      }

      const adminIds = Array.from(
        new Set(
          admins
            .map(admin => admin?.user?.id)
            .filter((id): id is number => typeof id === "number" && id > 0),
        ),
      )

      await this.deps.chatRepository.replaceAdmins(chatId, adminIds)
    } catch (error) {
      this.logger.e(`Не удалось обновить список админов для чата ${chatId}:`, error)
    }
  }

  private async sendMessage(chatId: number, text: string, replyToMessageId?: number): Promise<void> {
    if (!this.deps.eventBus)
      return

    const actions: TelegramAction[] = []

    // Удаляем сообщение команды если указан messageId
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
