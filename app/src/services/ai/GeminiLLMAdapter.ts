import type { Logger } from "../../helpers/Logger.js"
import type { IAIProvider } from "../AIChatService/providers/IAIProvider.js"
import { GeminiAdapter as LegacyGeminiAdapter } from "../AIChatService/providers/GeminiAdapter.js"
import type { LLMPort, ChatRequest, ChatResponse, ModerationBatchRequest, ModerationBatchResponse, ModerationDecision } from "./llm.models.js"
import { getDefaultModerationConfig } from "./moderation.policy.js"

export class GeminiLLMAdapter implements LLMPort, IAIProvider {
  private adapter: LegacyGeminiAdapter

  constructor(logger?: Logger) {
    this.adapter = new LegacyGeminiAdapter(logger)
  }

  async generateChatResponse(input: ChatRequest): Promise<ChatResponse> {
    const response = await this.adapter.generateContent(
      input.apiKey,
      input.messages[input.messages.length - 1]?.content || "",
      // conversationHistory: исключаем system (он передается как systemPrompt), используем роли напрямую
      input.messages.slice(0, -1).filter((m: any) => m.role !== "system").map((m: any) => ({
        role: m.role,
        content: m.content,
      })),
      input.systemPrompt,
      {
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
      },
    )

    return { content: response }
  }

  async moderateBatch(input: ModerationBatchRequest): Promise<ModerationBatchResponse> {
    const response = await this.adapter.generateContent(
      input.apiKey,
      input.prompt,
      [],
      undefined,
      getDefaultModerationConfig(),
    )

    const decisions = this.parseModerationDecisions(response)
    return { decisions }
  }

  // Реализация IAIProvider для обратной совместимости с AIChatService
  async generateContent(
    apiKey: string,
    prompt: string,
    conversationHistory?: any[],
    systemPrompt?: string,
    customConfig?: object,
    tools?: any[],
  ): Promise<string> {
    return this.adapter.generateContent(apiKey, prompt, conversationHistory, systemPrompt, customConfig, tools)
  }

  private parseModerationDecisions(response: string): ModerationDecision[] {
    const match = response.match(/\{[\s\S]*"violations"[\s\S]*\}/)
    if (!match) return []
    try {
      const parsed = JSON.parse(match[0])
      if (!Array.isArray(parsed.violations)) return []
      return parsed.violations
        .filter((v: any) => v && typeof v.messageId === "number" && typeof v.reason === "string" && typeof v.action === "string")
        .map((v: any) => ({ id: String(v.messageId), reason: v.reason, action: v.action }))
    } catch {
      return []
    }
  }
}


