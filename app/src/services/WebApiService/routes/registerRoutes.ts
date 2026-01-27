import type { FastifyInstance } from "fastify"
import type { Logger } from "../../../helpers/Logger.js"
import type { GroupManagementService } from "../../GroupManagementService/index.js"
import type { ChatConfigurationService } from "../../ChatConfigurationService/index.js"
import type { AuthorizationService } from "../../AuthorizationService/index.js"
import type { ChatRepository } from "../../../repository/ChatRepository.js"

interface RouteDependencies {
  groupManagement?: GroupManagementService
  chatConfiguration?: ChatConfigurationService
  authorizationService?: AuthorizationService
  chatRepository?: ChatRepository
}

export function registerRoutes(
  server: FastifyInstance,
  deps: RouteDependencies,
  logger: Logger,
): void {
  server.get("/api/users/:userId/chats", async (request, reply) => {
    if (!deps.chatRepository) {
      reply.code(503).send({ success: false, error: "service_unavailable" })
      return
    }

    const rawUserId = (request.params as { userId?: string })?.userId
    const userId = Number.parseInt(rawUserId ?? "", 10)
    if (Number.isNaN(userId)) {
      reply.code(400).send({ success: false, error: "invalid_user_id" })
      return
    }

    try {
      const chats = await deps.chatRepository.getAdminChatsWithConfig(userId)
      reply.send({
        success: true,
        chats: chats.map(chat => ({
          id: chat.id,
          title: chat.title,
          type: chat.type,
          active: chat.active,
          aiEnabled: chat.config?.aiEnabled ?? true,
        })),
      })
    } catch (error) {
      logger.e("Error fetching admin chats:", error)
      reply.code(500).send({ success: false, error: "internal_error" })
    }
  })

  server.post("/api/chats/:chatId/admins/sync", async (request, reply) => {
    const userId = Number((request.body as { userId?: number })?.userId)
    const chatId = parseChatId((request.params as { chatId?: string })?.chatId)

    if (chatId === null || Number.isNaN(userId)) {
      reply.code(400).send({ success: false, error: "invalid_payload" })
      return
    }

    const authorization = deps.authorizationService
    const groupManagement = deps.groupManagement

    if (!authorization || !groupManagement) {
      reply.code(503).send({ success: false, error: "service_unavailable" })
      return
    }

    const authResult = await authorization.checkGroupAdmin(chatId, userId)
    if (!authResult.authorized) {
      reply.code(403).send({
        success: false,
        error: authResult.reason ?? "forbidden",
      })
      return
    }

    try {
      await groupManagement.updateGroupAdmins(chatId)
      reply.send({ success: true })
    } catch (error) {
      logger.e("Error syncing admins:", error)
      reply.code(500).send({ success: false, error: "internal_error" })
    }
  })

  server.patch("/api/chats/:chatId/gemini-key", async (request, reply) => {
    const body = request.body as { userId?: number, apiKey?: string | null }
    const userId = Number(body?.userId)
    const apiKey = typeof body?.apiKey === "string" || body?.apiKey === null ? body.apiKey : undefined
    const chatId = parseChatId((request.params as { chatId?: string })?.chatId)

    if (chatId === null || Number.isNaN(userId) || apiKey === undefined) {
      reply.code(400).send({ success: false, error: "invalid_payload" })
      return
    }

    const chatConfiguration = deps.chatConfiguration
    if (!chatConfiguration) {
      reply.code(503).send({ success: false, error: "service_unavailable" })
      return
    }

    const result = await chatConfiguration.setGeminiApiKey(userId, chatId, apiKey)
    if (!result.authorized) {
      reply.code(403).send({
        success: false,
        error: result.reason ?? "forbidden",
      })
      return
    }

    if (!result.success) {
      const statusCode = result.error === "api_key_too_long" ? 400 : 500
      reply.code(statusCode).send({
        success: false,
        error: result.error ?? "internal_error",
      })
      return
    }

    reply.send({ success: true })
  })

  server.patch("/api/chats/:chatId/group-agent", async (request, reply) => {
    const body = request.body as { userId?: number, enabled?: boolean }
    const userId = Number(body?.userId)
    const enabled = body?.enabled
    const chatId = parseChatId((request.params as { chatId?: string })?.chatId)

    if (chatId === null || Number.isNaN(userId) || typeof enabled !== "boolean") {
      reply.code(400).send({ success: false, error: "invalid_payload" })
      return
    }

    const chatConfiguration = deps.chatConfiguration
    if (!chatConfiguration) {
      reply.code(503).send({ success: false, error: "service_unavailable" })
      return
    }

    const result = await chatConfiguration.setGroupAgentEnabled(userId, chatId, enabled)
    if (!result.authorized) {
      reply.code(403).send({
        success: false,
        error: result.reason ?? "forbidden",
      })
      return
    }

    if (!result.success) {
      reply.code(500).send({
        success: false,
        error: result.error ?? "internal_error",
      })
      return
    }

    reply.send({ success: true })
  })
}

function parseChatId(rawChatId?: string): number | null {
  if (typeof rawChatId !== "string") {
    return null
  }
  const chatId = Number.parseInt(rawChatId, 10)
  return Number.isNaN(chatId) ? null : chatId
}

