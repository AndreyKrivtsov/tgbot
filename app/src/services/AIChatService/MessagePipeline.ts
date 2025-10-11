import type { Logger } from "../helpers/Logger.js"
import type { AIResponseResult, IAIResponseService, IChatConfigService } from "./interfaces.js"
import type { ChatContext } from "./ChatContextManager.js"
import type { AdaptiveChatThrottleManager } from "./AdaptiveThrottleManager.js"
import { AI_CHAT_CONFIG } from "../../constants.js"
import { ContextLifecycle } from "./facades/ContextLifecycle.js"
import { ResponseDispatcher } from "./facades/ResponseDispatcher.js"

export interface PipelineDeps {
  logger: Logger
  contextLifecycle: ContextLifecycle
  aiResponseService: IAIResponseService
  chatConfigService: IChatConfigService
  throttleManager: AdaptiveChatThrottleManager
  dispatcher: ResponseDispatcher
}

export interface PipelineInput {
  queueItem: { id: number, message: string, contextId: string, userMessageId?: number, apiKey?: string }
}

export class MessagePipeline {
  private deps: PipelineDeps

  constructor(deps: PipelineDeps) {
    this.deps = deps
  }

  async run(input: PipelineInput): Promise<void> {
    const { queueItem } = input
    const { logger, contextLifecycle, aiResponseService, chatConfigService, throttleManager, dispatcher } = this.deps

    const context = await contextLifecycle.getOrCreateContext(queueItem.contextId)

    const chatId = Number(queueItem.contextId)
    const systemPrompt = await chatConfigService.getSystemPromptForChat(chatId)
    const apiKey = queueItem.apiKey || (await chatConfigService.getApiKeyForChat(chatId))?.key
    if (!apiKey) {
      dispatcher.emitError(queueItem.contextId, "API key not found", queueItem.id, queueItem.userMessageId)
      return
    }

    contextLifecycle.appendUserMessage(context, queueItem.message)

    const responseResult: AIResponseResult = await aiResponseService.generateResponse({
      message: queueItem.message,
      context,
      systemPrompt,
      apiKey,
    })

    if (!responseResult.success) {
      const errorMessage = `Ошибка AI: ${responseResult.error || "Unknown error"}`
      dispatcher.emitError(queueItem.contextId, errorMessage, queueItem.id, queueItem.userMessageId)
      return
    }

    contextLifecycle.appendModelMessage(context, responseResult.response!)
    contextLifecycle.touch(context, true)
    contextLifecycle.pruneByLimit(context, AI_CHAT_CONFIG.MAX_CONTEXT_MESSAGES)
    contextLifecycle.commit(queueItem.contextId, context)

    const responseText = responseResult.response!
    await throttleManager.waitForThrottle(queueItem.contextId, responseText.length)
    dispatcher.emitSuccess(queueItem.contextId, responseText, queueItem.id, queueItem.userMessageId)
  }
}


