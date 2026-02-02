export interface AdminMentionsPort {
  getAdminMentions: (chatId: number) => Promise<string[]>
}
