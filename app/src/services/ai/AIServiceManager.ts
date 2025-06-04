import type { Logger } from "../../helpers/Logger.js"
import type { GroupSettings } from "../../db/schema.js"
import { EventBus } from "../../core/EventBus.js"

export interface AIProvider {
  name: string
  type: "openai" | "anthropic" | "local" | "custom"
  generateResponse(prompt: string, context?: any): Promise<string>
  isAvailable(): boolean
}

export interface AIRequestContext {
  groupId: number
  userId: number
  conversationHistory?: any[]
  groupSettings: GroupSettings
}

export class AIServiceManager {
  private providers: Map<string, AIProvider> = new Map()
  private logger: Logger
  private eventBus: EventBus

  constructor(logger: Logger, eventBus: EventBus) {
    this.logger = logger
    this.eventBus = eventBus
  }

  /**
   * Регистрирует провайдера AI
   */
  registerProvider(provider: AIProvider): void {
    this.providers.set(provider.name, provider)
    this.logger.i(`AI provider registered: ${provider.name} (${provider.type})`)
  }

  /**
   * Получает провайдера по имени
   */
  getProvider(name: string): AIProvider | undefined {
    return this.providers.get(name)
  }

  /**
   * Генерирует ответ с использованием указанного провайдера
   */
  async generateResponse(
    providerName: string,
    prompt: string,
    context: AIRequestContext,
  ): Promise<string> {
    const provider = this.providers.get(providerName)
    
    if (!provider) {
      throw new Error(`AI provider not found: ${providerName}`)
    }

    if (!provider.isAvailable()) {
      throw new Error(`AI provider is not available: ${providerName}`)
    }

    try {
      this.eventBus.emit("ai:request", {
        groupId: context.groupId,
        userId: context.userId,
        prompt,
      })

      const response = await provider.generateResponse(prompt, {
        conversationHistory: context.conversationHistory,
        systemPrompt: context.groupSettings.systemPrompt,
        customPrompts: context.groupSettings.customPrompts,
      })

      this.eventBus.emit("ai:response", {
        groupId: context.groupId,
        userId: context.userId,
        prompt,
        response,
      })

      return response
    }
    catch (error) {
      this.logger.e(`AI request failed for provider ${providerName}:`, error)
      
      this.eventBus.emit("ai:error", {
        groupId: context.groupId,
        userId: context.userId,
        prompt,
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  }

  /**
   * Получает список доступных провайдеров
   */
  getAvailableProviders(): AIProvider[] {
    return Array.from(this.providers.values()).filter(provider => provider.isAvailable())
  }

  /**
   * Проверяет доступность провайдера
   */
  isProviderAvailable(name: string): boolean {
    const provider = this.providers.get(name)
    return provider ? provider.isAvailable() : false
  }
} 