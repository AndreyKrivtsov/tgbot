import type {
  AgentInstructions,
  BufferedMessage,
  HistoryEntry,
} from "../../domain/types.js"
import { formatMessageForAI } from "../../domain/MessageFormatter.js"

function formatHistoryEntry(entry: HistoryEntry): string {
  const base = entry.message.text
  const fragments: string[] = [`обработано: ${entry.result.classification}`]

  if (entry.result.moderationAction && entry.result.moderationAction !== "none") {
    fragments.push(`действие: ${entry.result.moderationAction}`)
  }

  if (entry.result.responseText) {
    fragments.push(`ответ: ${entry.result.responseText}`)
  }

  return `${base} → ${fragments.join(", ")}`
}

function renderHistorySection(history: HistoryEntry[]): string {
  if (history.length === 0) {
    return ""
  }

  return history.map(formatHistoryEntry).join("\n")
}

function renderNewMessagesSection(messages: BufferedMessage[]): string {
  if (messages.length === 0) {
    return ""
  }

  return messages
    .map(message => formatMessageForAI(message).text)
    .join("\n")
}

export interface PromptSections {
  system: string
  history: string
  newMessages: string
  moderationRules: string
  rules: string
  formatBlock: string
}

export function buildPromptSections(params: {
  instructions: AgentInstructions
  history: HistoryEntry[]
  messages: BufferedMessage[]
}): PromptSections {
  const { instructions, history, messages } = params

  const system = [
    `Вы — ${instructions.agent.name}`,
    `Ваша роль: ${instructions.agent.role}.`,
    instructions.agent.character ? `Характер: ${instructions.agent.character}` : null,
    instructions.customRules ? `Дополнительные правила: ${instructions.customRules}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n")

  const historySection = renderHistorySection(history)
  const newMessagesSection = renderNewMessagesSection(messages)
  const moderationRules = instructions.moderation.rules
  const rules = [
    `Триггеры для ответов: ${instructions.responses.triggers.join(", ")}.`,
    instructions.responses.rules,
  ].join("\n")

  const formatBlock = instructions.format.response

  return {
    system,
    history: historySection,
    newMessages: newMessagesSection,
    moderationRules,
    rules,
    formatBlock,
  }
}

export function buildClassificationPrompt(params: {
  instructions: AgentInstructions
  history: HistoryEntry[]
  messages: BufferedMessage[]
}): string {
  const sections = buildPromptSections(params)

  return [
    sections.system,
    "ПРАВИЛА ОТВЕТОВ:",
    sections.rules,
    "ПРАВИЛА МОДЕРАЦИИ:",
    sections.moderationRules,
    sections.formatBlock,
    "ИСТОРИЯ СООБЩЕНИЙ (уже обработанные):",
    sections.history || "<история отсутствует>",
    "НОВЫЕ СООБЩЕНИЯ ДЛЯ ОБРАБОТКИ:",
    sections.newMessages || "<нет новых сообщений>",
    "Верни только JSON без лишнего текста.",
  ].join("\n\n")
}
