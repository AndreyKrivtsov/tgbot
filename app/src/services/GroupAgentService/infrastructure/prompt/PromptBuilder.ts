import type {
  AgentInstructions,
  BufferedMessage,
  HistoryEntry,
} from "../../domain/types.js"
import { formatMessageForAI, formatMessageTag, formatResponseTag } from "../../domain/MessageFormatter.js"

interface NormalizedHistoryResult {
  classification?: HistoryEntry["result"]["classification"]
  requiresResponse: boolean
  actions: HistoryEntry["result"]["actions"]
  responseText?: string
}

function normalizeHistoryResult(
  result: HistoryEntry["result"] | (HistoryEntry["result"] & {
    moderationAction?: HistoryEntry["result"]["actions"][number]
    actions?: HistoryEntry["result"]["actions"]
    requiresResponse?: boolean
  }),
): NormalizedHistoryResult {
  const classification = result?.classification
  const responseText = result?.responseText
  const requiresResponse = typeof result?.requiresResponse === "boolean"
    ? result.requiresResponse
    : Boolean(responseText)

  const legacyAction = "moderationAction" in result ? result.moderationAction : undefined
  const actions = Array.isArray(result?.actions)
    ? result.actions.filter(action => action && action !== "none")
    : (legacyAction && legacyAction !== "none" ? [legacyAction] : [])

  return {
    classification,
    requiresResponse,
    actions,
    responseText,
  }
}

function buildEntry(id: number, messageTag: string, responseTag?: string | null): string {
  const lines = [`<entry id="${id}">`, `  ${messageTag}`]
  if (responseTag) {
    lines.push(`  ${responseTag}`)
  }
  lines.push("</entry>")
  return lines.join("\n")
}

function formatHistoryEntry(entry: HistoryEntry, index: number): string {
  const messageTag = formatMessageTag(entry.message)
  const normalized = normalizeHistoryResult(entry.result)
  const responseTag = formatResponseTag({
    classification: normalized.classification,
    requiresResponse: normalized.requiresResponse,
    actions: normalized.actions,
    text: normalized.responseText,
  })

  return buildEntry(index + 1, messageTag, responseTag)
}

function renderHistorySection(history: HistoryEntry[]): string {
  if (history.length === 0) {
    return ""
  }

  return history.map((entry, index) => formatHistoryEntry(entry, index)).join("\n")
}

function renderNewMessagesSection(messages: BufferedMessage[]): string {
  if (messages.length === 0) {
    return ""
  }

  return messages
    .map((message, index) => {
      const formatted = formatMessageForAI(message)
      const messageTag = formatMessageTag(formatted)
      return buildEntry(index + 1, messageTag)
    })
    .join("\n")
}

export interface PromptSections {
  system: string
  history: string
  newMessages: string
  moderationRules: string
  rules: string
  messageFormat: string
  formatBlock: string
}

export function buildPromptSections(params: {
  instructions: AgentInstructions
  history: HistoryEntry[]
  messages: BufferedMessage[]
}): PromptSections {
  const { instructions, history, messages } = params

  const systemLines = [
    `Вы — ${instructions.agent.name}`,
    `Ваша роль: ${instructions.agent.role}.`,
    instructions.agent.character ? `Характер: ${instructions.agent.character}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  const system = instructions.customRules
    ? `${systemLines}\nДополнительные правила: ${instructions.customRules}`
    : systemLines

  const historySection = renderHistorySection(history)
  const newMessagesSection = renderNewMessagesSection(messages)
  const moderationRules = instructions.moderation.rules
  const rules = [
    `Триггеры для ответов: ${instructions.responses.triggers.join(", ")}.`,
    instructions.responses.rules,
  ].join("\n")

  const messageFormat = instructions.format.message ?? ""
  const formatBlock = instructions.format.response

  return {
    system,
    history: historySection,
    newMessages: newMessagesSection,
    moderationRules,
    rules,
    messageFormat,
    formatBlock,
  }
}

export function buildClassificationPrompt(params: {
  instructions: AgentInstructions
  history: HistoryEntry[]
  messages: BufferedMessage[]
}): string {
  const sections = buildPromptSections(params)

  const systemParts = [
    sections.system,
    "ПРАВИЛА ОТВЕТОВ:",
    sections.rules,
    "ПРАВИЛА МОДЕРАЦИИ:",
    sections.moderationRules,
    "ФОРМАТ СООБЩЕНИЙ:",
    sections.messageFormat,
    "ФОРМАТ ОТВЕТА:",
    sections.formatBlock,
  ]
    .filter(Boolean)
    .join("\n\n")

  const historyBlock = sections.history
    ? `<history>\n${sections.history}\n</history>`
    : "<history></history>"

  const chatBlock = sections.newMessages
    ? `<chat>\n${sections.newMessages}\n</chat>`
    : "<chat></chat>"

  const systemBlock = `<system>\n${systemParts}\n</system>`
  const taskBlock = "<task>\nВерни только JSON без лишнего текста.\n</task>"

  return [systemBlock, historyBlock, chatBlock, taskBlock].join("\n\n")
}
