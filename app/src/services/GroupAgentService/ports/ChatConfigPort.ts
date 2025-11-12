export interface ChatConfig {
  chatId: number
  geminiApiKey?: string
  groupAgentEnabled?: boolean
}

export interface ChatConfigPort {
  getChatConfig(chatId: number): Promise<ChatConfig | null>
  isAdmin(chatId: number, userId: number): Promise<boolean>
}


