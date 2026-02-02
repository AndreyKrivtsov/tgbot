import { axiosWithProxy } from "../../../../helpers/axiosWithProxy.js"
import { GROUP_AGENT_CONFIG } from "../../../../constants.js"
import { Logger } from "../../../../helpers/Logger.js"
import type { AIProviderPort, AIProviderResult } from "../../ports/AIProviderPort.js"
import { AIProviderError } from "../../ports/AIProviderError.js"
import type { ChatConfigPort } from "../../ports/ChatConfigPort.js"

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

export class GeminiAdapter implements AIProviderPort {
  private readonly chatConfigPort: ChatConfigPort
  private readonly logger = new Logger("GeminiAdapter")

  constructor(chatConfigPort: ChatConfigPort) {
    this.chatConfigPort = chatConfigPort
  }

  async classifyBatch(input: { chatId: number, prompt: string }): Promise<AIProviderResult> {
    const config = await this.chatConfigPort.getChatConfig(input.chatId)
    if (!config?.geminiApiKey || !input.prompt) {
      return { text: null }
    }

    const requestBody = {
      contents: [
        {
          parts: [{ text: input.prompt }],
        },
      ],
      generationConfig: {
        temperature: 1.2,
        maxOutputTokens: 200,
      },
    }

    try {
      const model = getNextModel()
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`

      return await this.runClassificationAttempt({
        url,
        apiKey: config.geminiApiKey,
        requestBody,
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
  }): Promise<AIProviderResult> {
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

    return {
      text,
      usage: {
        promptTokens: data.usageMetadata?.promptTokenCount,
        totalTokens: data.usageMetadata?.totalTokenCount,
        modelVersion: data.modelVersion,
      },
    }
  }
}
