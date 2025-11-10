import type { ChatMessage } from "./llm.models.js"
import type { ChatContext } from "../AIChatService/ChatContextManager.js"
import { getMaxContextMessages } from "./chat.policy.js"

export function prepareMessages(context: ChatContext, currentMessage: string, systemPrompt: string): ChatMessage[] {
  const messages: ChatMessage[] = []
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt })
  }
  const maxMessages = getMaxContextMessages()
  const history = context.messages.length > maxMessages
    ? context.messages.slice(-maxMessages)
    : context.messages
  for (const msg of history) {
    if (!msg?.role || !msg?.content) continue
    messages.push({ role: msg.role as ChatMessage["role"], content: msg.content })
  }
  messages.push({ role: "user", content: currentMessage })
  return messages
}


