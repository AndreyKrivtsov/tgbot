import { describe, expect, it } from "@jest/globals"
import { PromptAssembler } from "../../services/GroupAgentService/application/PromptAssembler.js"
import { HistoryToPromptMapper } from "../../services/GroupAgentService/application/HistoryToPromptMapper.js"
import { CompactPromptBuilder } from "../../services/GroupAgentService/infrastructure/prompt/CompactPromptBuilder.js"
import { DEFAULT_PROMPT_SPEC } from "../../services/GroupAgentService/infrastructure/config/promptSpec.js"
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
  it("формирует компактный JSON промпта с контекстом и историей", () => {
    const assembler = new PromptAssembler(new CompactPromptBuilder(), new HistoryToPromptMapper())
    const prompt = assembler.buildPrompt({
      spec: DEFAULT_PROMPT_SPEC,
      context: {
        admins: [1, 2],
        flags: {},
        userStats: {},
      },
      history: makeHistory(),
      messages: makeMessages(),
    })

    const parsed = JSON.parse(prompt)
    expect(parsed.task).toBe("return_json_only")
    expect(parsed.sys).toBeDefined()
    expect(parsed.ctx.admins).toEqual([1, 2])
    expect(parsed.msgs).toHaveLength(2)
    expect(parsed.h).toHaveLength(2)
  })

  it("не добавляет пустую историю", () => {
    const assembler = new PromptAssembler(new CompactPromptBuilder(), new HistoryToPromptMapper())
    const prompt = assembler.buildPrompt({
      spec: DEFAULT_PROMPT_SPEC,
      context: {
        admins: [],
        flags: {},
        userStats: {},
      },
      history: [],
      messages: makeMessages(),
    })

    const parsed = JSON.parse(prompt)
    expect(parsed.h).toBeUndefined()
  })
})
