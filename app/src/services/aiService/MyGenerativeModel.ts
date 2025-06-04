import type { ModelParams, RequestOptions, StartChatParams } from "@google/generative-ai"
import { GenerativeModel } from "@google/generative-ai"
import { MyChatSession } from "./MyChatSession.js"

export class MyGenerativeModel extends GenerativeModel {
  constructor(apiKey: string, modelParams: ModelParams, _requestOptions?: RequestOptions) {
    super(apiKey, modelParams, _requestOptions)
  }

  /**
   * Gets a new {@link ChatSession} instance which can be used for
   * multi-turn chats.
   */
  startChat(startChatParams?: StartChatParams): MyChatSession {
    return new MyChatSession(
      this.apiKey,
      this.model,
      {
        generationConfig: this.generationConfig,
        safetySettings: this.safetySettings,
        tools: this.tools,
        toolConfig: this.toolConfig,
        systemInstruction: this.systemInstruction,
        cachedContent: this.cachedContent?.name,
        ...startChatParams,
      },
      // eslint-disable-next-line ts/ban-ts-comment
      // @ts-ignore
      this._requestOptions,
    )
  }
}
