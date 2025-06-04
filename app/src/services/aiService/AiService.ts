import type { AppConfig } from "../../config.js"
import { AI } from "./AI.js"

export class AiService {
  config: AppConfig
  ai: AI

  constructor(config: AppConfig) {
    this.config = config
    this.ai = new AI(this.config.AI_API_KEY)
    this.ai.initModel("gemini-2.0-flash")
  }

  async contextLength(contextId: string) {
    return this.ai.contextLength(contextId)
  }
}
