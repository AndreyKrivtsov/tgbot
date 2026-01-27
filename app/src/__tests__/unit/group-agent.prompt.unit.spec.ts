import { describe, expect, it } from "@jest/globals"
import { buildClassificationPrompt, buildPromptSections } from "../../services/GroupAgentService/infrastructure/prompt/PromptBuilder.js"
import type { AgentInstructions, BufferedMessage, HistoryEntry } from "../../services/GroupAgentService/domain/types.js"
import { DEFAULT_AGENT_INSTRUCTIONS } from "../../services/GroupAgentService/infrastructure/config/defaultInstructions.js"

const baseInstructions: AgentInstructions = {
  ...DEFAULT_AGENT_INSTRUCTIONS,
  responses: {
    ...DEFAULT_AGENT_INSTRUCTIONS.responses,
    triggers: ["bot_mention"],
  },
}

function makeHistory(): HistoryEntry[] {
  return [
    {
      message: {
        id: 101,
        chatId: -123,
        text: "[ID:101][2025-01-01 10:00][@user1][User One]: привет",
      },
      result: {
        classification: "normal",
        moderationAction: "none",
      },
      timestamp: Date.now() - 1_000,
    },
    {
      message: {
        id: 102,
        chatId: -123,
        text: "[ID:102][2025-01-01 10:01][@user2][User Two]: реклама!!!",
      },
      result: {
        classification: "violation",
        moderationAction: "delete",
      },
      timestamp: Date.now(),
    },
  ]
}

function makeMessages(): BufferedMessage[] {
  return [
    {
      messageId: 201,
      chatId: -123,
      userId: 11,
      text: "Альтрон, привет!",
      timestamp: Date.now(),
      username: "user3",
      firstName: "User Three",
      isAdmin: false,
    },
    {
      messageId: 202,
      chatId: -123,
      userId: 12,
      text: "Купите мой курс",
      timestamp: Date.now(),
      username: "spammer",
      firstName: "Спамер",
      isAdmin: false,
    },
  ]
}

describe("PromptBuilder", () => {
  it("формирует секции с историей и новыми сообщениями", () => {
    const sections = buildPromptSections({
      instructions: baseInstructions,
      history: makeHistory(),
      messages: makeMessages(),
    })

    expect(sections.system).toContain("Альтрон")
    expect(sections.history).toContain("<entry id=\"1\">")
    expect(sections.history).toContain("<response classification=\"")
    expect(sections.newMessages).toContain("<entry id=\"1\">")
    expect(sections.newMessages).not.toContain("<response")
    expect(sections.newMessages).toMatch(/timestamp="/)
    expect(sections.moderationRules.length).toBeGreaterThan(0)
    expect(sections.rules).toContain("bot_mention")
    expect(sections.messageFormat).toContain("<entry")
    expect(sections.formatBlock).toContain(`"results": [`)
  })

  it("buildClassificationPrompt включает ключевые секции", () => {
    const prompt = buildClassificationPrompt({
      instructions: baseInstructions,
      history: makeHistory(),
      messages: makeMessages(),
    })

    expect(prompt).toContain("<system>")
    expect(prompt).toContain("<history>")
    expect(prompt).toContain("<chat>")
    expect(prompt).toContain("<message chatId=\"-123\" userId=\"11\"")
    expect(prompt).toMatch(/timestamp="\d+"/)
    expect(prompt).toContain("<response classification=\"")
    expect(prompt).toContain("ФОРМАТ СООБЩЕНИЙ")
    expect(prompt).toContain("ПРАВИЛА МОДЕРАЦИИ")
    expect(prompt).toContain("Верни только JSON")
  })
})
