import { config } from "../config.js"

interface Chat {
  id: number
  name: string
}

export class ChatRepository {
  private chats: Map<number, Chat> = new Map()

  constructor() {
    this.chats.set(0, {
      id: config.DEFAULT_CHAT_ID,
      name: "Подслушано Океанус",
    })
  }

  getOrNew(chat: Chat): Chat {
    if (!this.chats.has(chat.id)) {
      this.chats.set(chat.id, chat)
    }

    return this.chats.get(chat.id) as Chat
  }

  get(chatId: number): Chat | undefined {
    return this.chats.get(chatId)
  }
}
