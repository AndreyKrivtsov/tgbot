import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { AddAltronKeyCommand, EventBus, TelegramAction, UltronToggleCommand } from "../../core/EventBus.js"
import type { AuthorizationResult, AuthorizationService } from "../AuthorizationService/index.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"
import { getMessage } from "../../shared/messages/index.js"

interface TelegramPort {
  getChat: (params: { chat_id: string }) => Promise<any>
}

interface ChatConfigurationDependencies {
  eventBus?: EventBus
  authorizationService?: AuthorizationService
  chatRepository?: ChatRepository
  telegramPort?: TelegramPort
}

interface ConfigActionResult extends AuthorizationResult {
  success: boolean
  error?: string
}

interface ConfigActionOptions {
  skipAuthorization?: boolean
}

export class ChatConfigurationService implements IService {
  private config: AppConfig
  private logger: Logger
  private deps: ChatConfigurationDependencies

  constructor(config: AppConfig, logger: Logger, deps: ChatConfigurationDependencies = {}) {
    this.config = config
    this.logger = logger
    this.deps = deps
  }

  private get chatRepository(): ChatRepository | undefined {
    return this.deps.chatRepository
  }

  private get authorizationService(): AuthorizationService | undefined {
    return this.deps.authorizationService
  }

  private buildUnavailableResult(): ConfigActionResult {
    return {
      authorized: false,
      success: false,
      reason: "service_unavailable",
    }
  }

  async setGeminiApiKey(
    actorUserId: number,
    chatId: number,
    apiKey: string | null,
    options: ConfigActionOptions = {},
  ): Promise<ConfigActionResult> {
    if (!this.chatRepository) {
      return this.buildUnavailableResult()
    }

    if (!options.skipAuthorization) {
      if (!this.authorizationService) {
        return this.buildUnavailableResult()
      }
      const authResult = await this.authorizationService.checkGroupAdmin(chatId, actorUserId)
      if (!authResult.authorized) {
        return { ...authResult, success: false }
      }
    }

    if (apiKey && apiKey.length > 50) {
      return {
        authorized: true,
        success: false,
        error: "api_key_too_long",
      }
    }

    const success = await this.chatRepository.setApiKey(chatId, apiKey)
    return {
      authorized: true,
      success,
      error: success ? undefined : "api_key_save_error",
    }
  }

  async setGroupAgentEnabled(
    actorUserId: number,
    chatId: number,
    enabled: boolean,
    options: ConfigActionOptions = {},
  ): Promise<ConfigActionResult> {
    if (!this.chatRepository) {
      return this.buildUnavailableResult()
    }

    if (!options.skipAuthorization) {
      if (!this.authorizationService) {
        return this.buildUnavailableResult()
      }
      const authResult = await this.authorizationService.checkGroupAdmin(chatId, actorUserId)
      if (!authResult.authorized) {
        return { ...authResult, success: false }
      }
    }

    const success = await this.chatRepository.toggleAi(chatId, enabled)
    return {
      authorized: true,
      success,
      error: success ? undefined : "ultron_error",
    }
  }

  async initialize(): Promise<void> {
    if (!this.deps.eventBus)
      return
    const bus = this.deps.eventBus

    bus.onCommandUltronToggle(async (cmd: UltronToggleCommand) => {
      await this.handleUltronToggle(cmd)
    })

    bus.onCommandAddAltronKey(async (cmd: AddAltronKeyCommand) => {
      await this.handleAddAltronKey(cmd)
    })
  }

  private async handleUltronToggle(cmd: UltronToggleCommand): Promise<void> {
    const { actorId, chatId, messageId, targetChat, enabled, actorUsername } = cmd

    if (!this.deps.authorizationService || !this.deps.chatRepository) {
      return
    }

    try {
      let targetChatId: number
      let targetChatUsername: string | undefined

      if (targetChat?.id) {
        targetChatId = targetChat.id
      } else if (targetChat?.username) {
        targetChatUsername = targetChat.username
        const foundChat = await this.findChatByUsername(targetChatUsername)
        if (!foundChat) {
          await this.sendMessage(chatId, getMessage("ultron_chat_not_found", { username: targetChatUsername }), messageId)
          return
        }
        targetChatId = foundChat.id

        if (!this.deps.authorizationService.isSuperAdmin(actorUsername)) {
          await this.sendMessage(chatId, getMessage("ultron_no_permission", { username: targetChatUsername }), messageId)
          return
        }
      } else {
        targetChatId = chatId
        const resolvedActorUsername = actorUsername || await this.getActorUsername(actorId, chatId)
        const authResult = await this.deps.authorizationService.checkGroupAdmin(chatId, actorId, resolvedActorUsername)

        if (!authResult.authorized) {
          const reasonKey = authResult.reason === "no_group_admin_permission" ? "no_group_admin_permission" : "no_admin_permission"
          await this.sendMessage(chatId, getMessage(reasonKey), messageId)
          return
        }
      }

      const result = await this.setGroupAgentEnabled(actorId, targetChatId, enabled, { skipAuthorization: true })

      if (result.success) {
        let message: string
        if (targetChatUsername) {
          message = getMessage(
            enabled ? "ultron_enabled_for_chat" : "ultron_disabled_for_chat",
            { username: targetChatUsername },
          )
        } else {
          message = getMessage(enabled ? "ultron_enabled" : "ultron_disabled")
        }

        await this.sendMessage(chatId, message, messageId)
        this.logger.i(`AI ${enabled ? "enabled" : "disabled"} for chat ${targetChatId}${targetChatUsername ? ` (@${targetChatUsername})` : ""}`)
      } else {
        await this.sendMessage(chatId, getMessage("ultron_error"), messageId)
      }
    } catch (error) {
      this.logger.e("Error handling ultron command:", error)
      await this.sendMessage(chatId, getMessage("ultron_error"), messageId)
    }
  }

  private async handleAddAltronKey(cmd: AddAltronKeyCommand): Promise<void> {
    const { actorId, chatId, messageId, targetChat, apiKey, actorUsername } = cmd

    // Команда работает только в приватном чате с ботом (chatId > 0 для приватных чатов)
    if (chatId <= 0) {
      await this.sendMessage(chatId, getMessage("api_key_private_only"), messageId)
      return
    }

    if (!this.deps.authorizationService || !this.deps.chatRepository) {
      return
    }

    try {
      if (!targetChat?.username) {
        await this.sendMessage(chatId, getMessage("api_key_invalid_format"), messageId)
        return
      }

      if (!apiKey || apiKey.length > 50) {
        await this.sendMessage(chatId, getMessage("api_key_too_long"), messageId)
        return
      }

      const chatUsername = targetChat.username.replace("@", "")
      const foundChat = await this.findChatByUsername(chatUsername)

      if (!foundChat) {
        await this.sendMessage(chatId, getMessage("api_key_chat_not_found", { username: chatUsername }), messageId)
        return
      }

      const isSuperAdmin = this.deps.authorizationService.isSuperAdmin(actorUsername)
      if (!isSuperAdmin) {
        const hasPermission = await this.deps.chatRepository.isAdmin(foundChat.id, actorId)
        if (!hasPermission) {
          await this.sendMessage(chatId, getMessage("api_key_no_permission", { username: chatUsername }), messageId)
          return
        }
      }

      const result = await this.setGeminiApiKey(actorId, foundChat.id, apiKey, { skipAuthorization: true })

      if (result.success) {
        await this.sendMessage(chatId, getMessage("api_key_success", { username: chatUsername }), messageId)
        this.logger.i(`API key added for chat @${chatUsername} by user ${actorId}`)
      } else {
        await this.sendMessage(chatId, getMessage("api_key_save_error"), messageId)
      }
    } catch (error) {
      this.logger.e("Error in addAltronKey command:", error)
      await this.sendMessage(chatId, getMessage("api_key_general_error"), messageId)
    }
  }

  private async findChatByUsername(username: string): Promise<{ id: number, title?: string } | null> {
    if (!this.deps.chatRepository || !this.deps.telegramPort) {
      return null
    }

    try {
      try {
        const chatInfo = await this.deps.telegramPort.getChat({
          chat_id: `@${username}`,
        })

        if (chatInfo && chatInfo.id) {
          const existingChat = await this.deps.chatRepository.getChat(chatInfo.id)
          if (existingChat && existingChat.active) {
            return {
              id: chatInfo.id,
              title: chatInfo.title || chatInfo.first_name || username,
            }
          }
        }
      } catch (apiError) {
        this.logger.d(`Telegram API couldn't find chat @${username}:`, apiError)
      }

      const chats = await this.deps.chatRepository.getActiveAiChats()

      for (const chat of chats) {
        if (chat.title?.toLowerCase().includes(username.toLowerCase())) {
          return { id: chat.id, title: chat.title }
        }
      }

      return null
    } catch (error) {
      this.logger.e("Error finding chat by username:", error)
      return null
    }
  }

  private async getActorUsername(_userId: number, _chatId: number): Promise<string | undefined> {
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
