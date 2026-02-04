import { describe, expect, it } from "@jest/globals"
import { PromptAssembler } from "../../services/GroupAgentService/application/PromptAssembler.js"
import { HistoryToPromptMapper } from "../../services/GroupAgentService/application/HistoryToPromptMapper.js"
import { XmlPromptBuilder } from "../../services/GroupAgentService/infrastructure/prompt/XmlPromptBuilder.js"
import { DEFAULT_PROMPT_TEXT } from "../../services/GroupAgentService/infrastructure/config/promptText.js"
import type { BufferedMessage } from "../../services/GroupAgentService/domain/Message.js"
import type { StoredHistoryEntry } from "../../services/GroupAgentService/domain/Batch.js"

function makeHistory(): StoredHistoryEntry[] {
  return [
    {
      message: {
        messageId: 101,
        chatId: -123,
        userId: 11,
        text: "привет",
        timestamp: Date.now() - 1_000,
        isAdmin: false,
      },
      sender: "user",
      decision: {
        classification: "normal",
        requiresResponse: false,
        actions: [],
      },
      timestamp: Date.now() - 1_000,
    },
    {
      message: {
        messageId: 102,
        chatId: -123,
        userId: 12,
        text: "реклама!!!",
        timestamp: Date.now(),
        isAdmin: false,
      },
      sender: "user",
      decision: {
        classification: "violation",
        requiresResponse: false,
        actions: ["delete"],
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

describe("PromptAssembler", () => {
  it("формирует XML промпт с контекстом и историей", () => {
    const assembler = new PromptAssembler(new XmlPromptBuilder(), new HistoryToPromptMapper())
    const prompt = assembler.buildPrompt({
      system: DEFAULT_PROMPT_TEXT,
      context: {
        admins: [1, 2],
        flags: {},
        userStats: {},
      },
      history: makeHistory(),
      messages: makeMessages(),
    })

    expect(prompt).toContain("<system>")
    expect(prompt).toContain("<input>")
    expect(prompt).toContain("<messages>")
    expect(prompt).toContain("<history>")
    expect(prompt).toContain("<context>")
  })

  it("вставляет пустую историю как []", () => {
    const assembler = new PromptAssembler(new XmlPromptBuilder(), new HistoryToPromptMapper())
    const prompt = assembler.buildPrompt({
      system: DEFAULT_PROMPT_TEXT,
      context: {
        admins: [],
        flags: {},
        userStats: {},
      },
      history: [],
      messages: makeMessages(),
    })

    expect(prompt).toContain("<history>[]</history>")
  })
})
