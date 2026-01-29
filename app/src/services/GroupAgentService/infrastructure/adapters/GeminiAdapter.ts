import { axiosWithProxy } from "../../../../helpers/axiosWithProxy.js"
import { GROUP_AGENT_CONFIG } from "../../../../constants.js"
import { Logger } from "../../../../helpers/Logger.js"
import type { AIProviderPort } from "../../ports/AIProviderPort.js"
import { AIProviderError } from "../../ports/AIProviderError.js"
import type { ChatConfigPort } from "../../ports/ChatConfigPort.js"
import type {
  AgentInstructions,
  BatchClassificationResult,
  BufferedMessage,
  ClassificationResult,
  HistoryEntry,
} from "../../domain/types.js"

import { buildClassificationPrompt } from "../prompt/PromptBuilder.js"

interface ClassificationInput {
  chatId: number
  history: HistoryEntry[]
  messages: BufferedMessage[]
  instructions: AgentInstructions
}

interface GeminiContentPart {
  text?: string
}

interface GeminiCandidate {
  content?: {
    parts?: GeminiContentPart[]
  }
  finishReason?: string
}

interface GeminiResponse {
  candidates?: GeminiCandidate[]
  error?: {
    message?: string
    code?: number
    status?: string
  }
  usageMetadata?: {
    promptTokenCount?: number
    totalTokenCount?: number
  }
  modelVersion?: string
}

const GEMINI_MODELS = [
  "gemma-3-27b-it",
  // "gemini-2.5-flash-lite",
]

let currentModelIndex = 0

function getNextModel(): string {
  const model = GEMINI_MODELS[currentModelIndex]
  currentModelIndex = (currentModelIndex + 1) % GEMINI_MODELS.length
  return model ?? "gemini-2.5-flash-lite"
}

function extractTextFromResponse(data: GeminiResponse): string | null {
  if (!data) {
    return null
  }

  if (data.error?.message) {
    throw new Error(`Gemini API error: ${data.error.message}`)
  }

  const candidate = data.candidates?.[0]
  if (!candidate) {
    return null
  }

  if (candidate.finishReason && candidate.finishReason !== "STOP") {
    throw new Error(`Gemini generation interrupted: ${candidate.finishReason}`)
  }

  const part = candidate.content?.parts?.[0]
  if (!part?.text) {
    return null
  }

  return part.text
}

function safeParseJson(text: string): any | null {
  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    const trimmed = text.trim()
    const start = trimmed.indexOf("{")
    const end = trimmed.lastIndexOf("}")
    if (start >= 0 && end > start) {
      const candidate = trimmed.slice(start, end + 1)
      try {
        return JSON.parse(candidate)
      } catch {
        return null
      }
    }
    return null
  }
}

function normalizeResults(raw: any, allowedMessageIds: Set<number>): BatchClassificationResult {
  if (!raw || !Array.isArray(raw.results)) {
    return { results: [] }
  }

  const normalized: ClassificationResult[] = []
  const validModerationActions = new Set(["none", "warn", "delete", "mute", "unmute", "kick", "ban", "unban"])

  for (const item of raw.results) {
    if (!item || typeof item.messageId !== "number" || !allowedMessageIds.has(item.messageId)) {
      continue
    }

    const classification = item.classification ?? {}
    const type = classification.type === "violation" || classification.type === "bot_mention"
      ? classification.type
      : "normal"
    const requiresResponse = Boolean(classification.requiresResponse)

    const moderationAction = typeof item.moderationAction === "string" && validModerationActions.has(item.moderationAction)
      ? item.moderationAction
      : "none"

    const durationMinutes = typeof item.durationMinutes === "number" && item.durationMinutes > 0 ? item.durationMinutes : undefined

    const normalizedItem: ClassificationResult = {
      messageId: item.messageId,
      classification: {
        type,
        requiresResponse,
      },
      moderationAction,
      responseText: item.responseText,
      targetUserId: typeof item.targetUserId === "number" && item.targetUserId > 0 ? item.targetUserId : undefined,
      targetMessageId: typeof item.targetMessageId === "number" ? item.targetMessageId : undefined,
      durationMinutes,
    }

    normalized.push(normalizedItem)
  }

  return { results: normalized }
}

export class GeminiAdapter implements AIProviderPort {
  private readonly chatConfigPort: ChatConfigPort
  private readonly logger = new Logger("GeminiAdapter")

  constructor(chatConfigPort: ChatConfigPort) {
    this.chatConfigPort = chatConfigPort
  }

  async classifyBatch(input: ClassificationInput): Promise<BatchClassificationResult> {
    const config = await this.chatConfigPort.getChatConfig(input.chatId)
    if (!config?.geminiApiKey || input.messages.length === 0) {
      return { results: [] }
    }

    const prompt = buildClassificationPrompt({
      instructions: input.instructions,
      history: input.history,
      messages: input.messages,
    })

    this.logger.d("Prompt:", prompt)
    this.logger.d("Messages:", input.messages.length)
    this.logger.d("History:", input.history.length)
    this.logger.d("Instructions:", input.instructions)

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 1.3,
        // topP: 0.7,
        // topK: 32,
        maxOutputTokens: 200,
      },
    }

    const allowedMessageIds = new Set(input.messages.map(message => message.messageId))

    try {
      const model = getNextModel()
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

      return await this.runClassificationAttempt({
        url,
        apiKey: config.geminiApiKey,
        requestBody,
        allowedMessageIds,
      })
    } catch (error) {
      if (error instanceof AIProviderError) {
        throw error
      }
      const err = error as any
      this.logger.e("Request failed", {
        chatId: input.chatId,
        error: {
          code: err?.code,
          status: err?.response?.status,
          response: err?.response?.data?.error,
        },
      })
      throw new AIProviderError("Gemini request failed", {
        statusCode: err?.response?.status,
        providerStatus: err?.response?.data?.error?.status,
      })
    }
  }

  private async runClassificationAttempt(params: {
    url: string
    apiKey: string
    requestBody: Record<string, unknown>
    allowedMessageIds: Set<number>
  }): Promise<BatchClassificationResult> {
    const response = await axiosWithProxy({
      url: params.url,
      method: "POST",
      headers: {
        "x-goog-api-key": params.apiKey,
        "Content-Type": "application/json",
      },
      data: JSON.stringify(params.requestBody),
      timeout: GROUP_AGENT_CONFIG.AI_REQUEST_TIMEOUT_MS,
      responseType: "json",
    })

    const data = response.data as GeminiResponse

    const text = extractTextFromResponse(data)
    if (!text) {
      return { results: [] }
    }

    const parsed = safeParseJson(text)

    if (!parsed) {
      return {
        results: [],
        usage: {
          promptTokens: data.usageMetadata?.promptTokenCount,
          totalTokens: data.usageMetadata?.totalTokenCount,
          modelVersion: data.modelVersion,
        },
      }
    }

    const normalized = normalizeResults(parsed, params.allowedMessageIds)
    normalized.usage = {
      promptTokens: data.usageMetadata?.promptTokenCount,
      totalTokens: data.usageMetadata?.totalTokenCount,
      modelVersion: data.modelVersion,
    }
    return normalized
  }
}
