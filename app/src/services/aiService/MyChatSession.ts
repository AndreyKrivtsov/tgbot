import type { Content, RequestOptions, StartChatParams } from "@google/generative-ai"
import { ChatSession } from "@google/generative-ai"

export class MyChatSession extends ChatSession {
  constructor(apiKey: string, model: string, params?: StartChatParams, _requestOptions?: RequestOptions) {
    super(apiKey, model, params, _requestOptions)
  }

  async cutHistory(cutLength: number) {
    const history = await this.getHistory()

    if (history && history.length > cutLength) {
      const overLength = history.length - cutLength
      const gap = Math.round(cutLength / 5)
      const _history = history.slice(overLength + gap)

      const firstItem = _history[0]
      if (firstItem?.role === "model") {
        this.setHistory(_history.slice(1))
      } else {
        this.setHistory(_history)
      }
    }
  }

  setHistory(history: Content[]) {
    // eslint-disable-next-line ts/ban-ts-comment
    // @ts-ignore
    this._history = history
  }

  printHistory(history: Content[]) {
    const formatted = history.map(item => item.parts).map(item => item.map(item => item.text)).map(item => item.join(""))
    return formatted
  }
}
