import type { AIProvider } from "../AIServiceManager.js"

export interface OpenAIConfig {
  apiKey: string
  model: string
  maxTokens?: number
  temperature?: number
}

export class OpenAIProvider implements AIProvider {
  public readonly name = "openai"
  public readonly type = "openai" as const

  private config: OpenAIConfig
  private baseUrl = "https://api.openai.com/v1"

  constructor(config: OpenAIConfig) {
    this.config = config
  }

  async generateResponse(prompt: string, context?: any): Promise<string> {
    const messages = [
      {
        role: "system",
        content: context?.systemPrompt || "You are a helpful AI assistant.",
      },
      ...((context?.conversationHistory || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      }))),
      {
        role: "user",
        content: prompt,
      },
    ]

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens || 1000,
        temperature: this.config.temperature || 0.7,
      }),
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || "No response generated"
  }

  isAvailable(): boolean {
    return !!this.config.apiKey
  }
} 