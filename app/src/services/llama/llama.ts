import axios from "axios"
import { config } from "../../config.js"

type LlamaParam = "maxTokens" | "temperature" | "minP" | "topK" | "topP" | "seed"

export class Llama {
  isBusy: boolean
  contextText: string
  params = {
    maxTokens: 1000,
    temperature: 0,
    minP: 0,
    topK: 0,
    topP: 0,
    seed: 0,
  }

  constructor() {
    this.isBusy = false
    this.contextText = ""
  }

  async answer(sessionId: string, message: string) {
    if (this.isBusy) {
      return
    }

    try {
      this.isBusy = true
      const result = await axios.post(config.LLAMA_URL, {
        contextId: sessionId,
        message: message + this.contextText,
        params: this.params,
      })

      this.isBusy = false

      if (result.status === 200) {
        return result.data
      } else {
        return null
      }
    } catch (e) {
      const _e = e as unknown as { message: string }
      this.isBusy = false
      console.error("Ошибка запроса к llama")
      console.error(_e.message)
      return null
    }
  }

  setContextText(text: string) {
    this.contextText = text
  }

  resetParams() {
    this.params = {
      maxTokens: 1000,
      temperature: 0,
      minP: 0,
      topK: 0,
      topP: 0,
      seed: 0,
    }
  }
}
