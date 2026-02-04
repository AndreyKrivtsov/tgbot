import type { PromptBuildInput } from "../domain/PromptContract.js"

export interface PromptBuilderPort {
  buildPrompt: (input: PromptBuildInput) => string
}
