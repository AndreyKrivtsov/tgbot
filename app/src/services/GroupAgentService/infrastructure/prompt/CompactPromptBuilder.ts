import type { PromptBuilderPort } from "../../ports/PromptBuilderPort.js"
import type { CompactPrompt } from "../../domain/PromptContract.js"

export class CompactPromptBuilder implements PromptBuilderPort {
  buildPrompt(prompt: CompactPrompt): string {
    return JSON.stringify(prompt)
  }
}
