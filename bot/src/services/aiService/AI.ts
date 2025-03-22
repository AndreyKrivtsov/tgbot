import type { Content } from "@google/generative-ai"
import type { MyChatSession } from "./MyChatSession.js"
import type { MyGenerativeModel } from "./MyGenerativeModel.js"
import { Log } from "../../helpers/Log.js"
import { loadHistory, saveHistory } from "./historyFile.js"
import { MyGoogleGenerativeAI } from "./MyGoogleGenerativeAI.js"
import { systemInstruction } from "./systemInstruction.js"

const DEFAULT_MODEL_NAME = "gemini-2.0-flash"
const DEFAULT_INSTRUCION = systemInstruction
const HISTORY_LENGTH = 600

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
  api: MyGoogleGenerativeAI
  model: MyGenerativeModel | null = null
  contexts: Record<string, MyChatSession> = {}

  tempHistory: any[] = []

  config: AIParams = {
    modelName: "gemini-2.0-flash",
    systemInstruction: DEFAULT_INSTRUCION,
    seed: undefined,
    temperature: 1.5,
    topP: 0.95,
    topK: 80,
    frequencyPenalty: 1,
    maxOutputTokens: 8192,
    stopSequences: [],
    responseMimeType: "text/plain",
  }

  log = new Log("[AI.ts]")

  constructor(apiKey: string) {
    this.api = new MyGoogleGenerativeAI(apiKey)
  }

  initModel(modelName?: string, systemInstruction?: string) {
    this.contexts = {}
    this.config.modelName = modelName ?? DEFAULT_MODEL_NAME
    this.config.systemInstruction = systemInstruction ?? DEFAULT_INSTRUCION

    this.model = this.api.getGenerativeModel({
      model: this.config.modelName,
      systemInstruction: this.config.systemInstruction,
    }) as MyGenerativeModel
  }

  setInstruction(systemInstruction: string) {
    this.initModel(this.config.modelName, systemInstruction)
  }

  addStopSequesce(sequence: string) {
    if (this.config.stopSequences.length < 5) {
      this.config.stopSequences.push(sequence)
    }
  }

  deleteStopSequesce(index: number) {

  }

  async getContext(contextId: string): Promise<MyChatSession | undefined> {
    let chatContext

    if (!this.hasContext(contextId)) {
      chatContext = await this.newContext(contextId)
    } else {
      chatContext = this.contexts[contextId]
    }

    if (!chatContext) {
      console.error("Unknown error with creating context.")
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

  async contextLength(contextId: string) {
    const history = await this.loadHistory(contextId)
    const flatHistory = history?.map(item => item.parts.map(part => part.text).join(""))

    return {
      text: flatHistory ? flatHistory.join("").length : 0,
      messages: flatHistory ? flatHistory.length : 0,
    }
  }

  async request(contextId: string, text: string) {
    try {
      const chatContext = await this.getContext(contextId)

      let result

      try {
        result = await chatContext?.sendMessage(text)
      } catch (e) {
        this.log.e(e)
      }

      const history = await chatContext?.getHistory()

      if (history && history.length > HISTORY_LENGTH) {
        chatContext?.cutHistory(HISTORY_LENGTH)
      }

      this.saveHistory(contextId, history)

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

  async loadHistory(contextId: string): Promise<Content[] | null> {
    return await loadHistory(contextId)
  }
}
