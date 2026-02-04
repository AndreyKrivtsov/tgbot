import type { PromptBuilderPort } from "../../ports/PromptBuilderPort.js"
import type { PromptBuildInput } from "../../domain/PromptContract.js"

export class XmlPromptBuilder implements PromptBuilderPort {
  buildPrompt(input: PromptBuildInput): string {
    const payload = [
      input.system.trim(),
      "<input>",
      `<context>${this.escapeXml(JSON.stringify(input.context))}</context>`,
      `<history>${this.escapeXml(JSON.stringify(input.history ?? []))}</history>`,
      `<messages>${this.escapeXml(JSON.stringify(input.messages))}</messages>`,
      "</input>",
    ]

    return payload.join("\n")
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  }
}
