import type { GenerativeModel, ModelParams, RequestOptions } from "@google/generative-ai"
import { GoogleGenerativeAI, GoogleGenerativeAIError } from "@google/generative-ai"
import { MyGenerativeModel } from "./MyGenerativeModel.js"

export class MyGoogleGenerativeAI extends GoogleGenerativeAI {
  constructor(apiKey: string) {
    super(apiKey)
  }

  getGenerativeModel(
    modelParams: ModelParams,
    requestOptions?: RequestOptions,
  ): GenerativeModel {
    if (!modelParams.model) {
      throw new GoogleGenerativeAIError(
        `Must provide a model name. `
        + `Example: genai.getGenerativeModel({ model: 'my-model-name' })`,
      )
    }
    return new MyGenerativeModel(this.apiKey, modelParams, requestOptions)
  }
}
