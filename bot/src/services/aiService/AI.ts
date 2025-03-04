import type { ChatSession, Content, GenerativeModel } from "@google/generative-ai"
import { GoogleGenerativeAI } from "@google/generative-ai"
import { Log } from "../../utils/Log.js"
import { loadHistory, saveHistory } from "./history.js"

const DEFAULT_MODEL_NAME = "gemini-2.0-flash"
const DEFAULT_INSTRUCION = "Тебя зовут Бот, тебя сделал админ этого чата. Ты бот-помощник в большом чате, в котором много пользователей. Вопрос от пользователя будет начинаться с его никнейма и имени, например \"senen/Кирилл:\". Пожалуйста, запоминай пользователей по именам, а не по никнеймам. Не используй Markdown."

interface AIParams {
  modelName: string
  systemInstruction: string
  seed: number | undefined
  temperature: number
  topP: number
  topK: number
  frequencyPenalty: number
  maxOutputTokens: number
  stopSequences: string[]
  responseMimeType: string
}

export class AI {
  api: GoogleGenerativeAI
  model: GenerativeModel | null = null
  contexts: Record<string, ChatSession> = {}

  tempHistory: any[] = []

  config: AIParams = {
    modelName: "gemini-2.0-flash",
    systemInstruction: "",
    seed: undefined,
    temperature: 1,
    topP: 0.95,
    topK: 40,
    frequencyPenalty: 1,
    maxOutputTokens: 8192,
    stopSequences: [],
    responseMimeType: "text/plain",
  }

  log = new Log("[AI.ts]")

  constructor(apiKey: string) {
    this.api = new GoogleGenerativeAI(apiKey)
  }

  initModel(modelName?: string, systemInstruction?: string) {
    this.contexts = {}
    this.config.modelName = modelName ?? DEFAULT_MODEL_NAME
    this.config.systemInstruction = systemInstruction ?? DEFAULT_INSTRUCION

    this.model = this.api.getGenerativeModel({
      model: this.config.modelName,
      systemInstruction: this.config.systemInstruction,
    })
  }

  setInstrucion(systemInstruction: string) {
    this.initModel(this.config.modelName, systemInstruction)
  }

  addStopSequesce(sequence: string) {
    if (this.config.stopSequences.length < 5) {
      this.config.stopSequences.push(sequence)
    }
  }

  deleteStopSequesce(index: number) {

  }

  getContext(contextId: string) {
    let chatContext

    if (!this.hasContext(contextId)) {
      chatContext = this.newContext(contextId)
    } else {
      chatContext = this.contexts[contextId]
    }

    if (!chatContext) {
      console.error("Unknown error with creating context.")
      return null
    }

    return chatContext
  }

  async newContext(contextId: string) {
    if (!this.model) {
      console.error("Error creating context, because model is empty")
      return undefined
    }

    const history = await this.loadHistory(contextId)

    const context = this.model.startChat({
      history: history ?? [],
    })

    this.contexts[contextId] = context
    return context
  }

  hasContext(contextId: string) {
    return contextId in this.contexts
  }

  async request(contextId: string, text: string) {
    try {
      const chatContext = await this.getContext(contextId)
      const result = await chatContext?.sendMessage(text)

      this.saveHistory(contextId, await chatContext?.getHistory())

      if (result) {
        return result.response.text()
      }

      return ""
    } catch (e) {
      this.log.e(e)
      return ""
    }
  }

  async saveHistory(contextId: string, context?: Content[]) {
    if (context) {
      await saveHistory(contextId, context)
    }
  }

  async loadHistory(contextId: string): Promise<Content[] | undefined> {
    if (contextId) {
      return await loadHistory(contextId)
    }
  }
}
