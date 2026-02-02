import type { CompactPrompt } from "../domain/PromptContract.js"

export interface PromptBuilderPort {
  buildPrompt: (prompt: CompactPrompt) => string
}
