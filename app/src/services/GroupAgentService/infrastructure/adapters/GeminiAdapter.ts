import { axiosWithProxy } from "../../../../helpers/axiosWithProxy.js"
import { GROUP_AGENT_CONFIG } from "../../../../constants.js"
import type { AIProviderPort } from "../../ports/AIProviderPort.js"
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

// const GEMINI_MODEL = "gemini-2.0-flash"
const GEMINI_MODEL = "gemma-3-27b-it"
// const GEMINI_MODEL = "gemini-2.5-flash-lite"

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

  constructor(chatConfigPort: ChatConfigPort) {
    this.chatConfigPort = chatConfigPort
  }

  async classifyBatch(input: ClassificationInput): Promise<BatchClassificationResult | null> {
    const config = await this.chatConfigPort.getChatConfig(input.chatId)
    if (!config?.geminiApiKey || input.messages.length === 0) {
      return null
    }

    const prompt = buildClassificationPrompt({
      instructions: input.instructions,
      history: input.history,
      messages: input.messages,
    })

    console.log("[GroupAgentService][GeminiAdapter] sending batch to Gemini", prompt)

    const requestBody = {
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 1.9,
        // topP: 0.7,
        // topK: 32,
        maxOutputTokens: 200,
      },
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${config.geminiApiKey}`
    const allowedMessageIds = new Set(input.messages.map(message => message.messageId))

    for (let attempt = 0; attempt <= GROUP_AGENT_CONFIG.AI_MAX_RETRIES; attempt++) {
      try {
        const response = await axiosWithProxy({
          url,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          data: JSON.stringify(requestBody),
          timeout: GROUP_AGENT_CONFIG.AI_REQUEST_TIMEOUT_MS,
          responseType: "json",
        })

        const data = response.data as GeminiResponse

        console.log("[GroupAgentService][GeminiAdapter] usage stats", {
          promptTokenCount: data.usageMetadata?.promptTokenCount,
          modelVersion: data.modelVersion,
        })

        const text = extractTextFromResponse(data)
        if (!text) {
          return { results: [] }
        }

        const parsed = safeParseJson(text)
        if (!parsed) {
          return null
        }

        const normalized = normalizeResults(parsed, allowedMessageIds)
        normalized.usage = {
          promptTokens: data.usageMetadata?.promptTokenCount,
          totalTokens: data.usageMetadata?.totalTokenCount,
          modelVersion: data.modelVersion,
        }
        return normalized
      } catch (error) {
        console.error("[GroupAgentService][GeminiAdapter] request failed", {
          attempt,
          chatId: input.chatId,
          error,
        })
        if (attempt === GROUP_AGENT_CONFIG.AI_MAX_RETRIES) {
          return null
        }
      }
    }

    return null
  }
}
