import { requestJson } from "../../../shared/api/http.js"

export const getUserChats = (userId) => requestJson(`/api/users/${userId}/chats`)

export const syncChatAdmins = (chatId, userId) => requestJson(
  `/api/chats/${chatId}/admins/sync`,
  {
    method: "POST",
    body: JSON.stringify({ userId }),
  },
)

export const updateChatApiKey = (chatId, userId, apiKey) => requestJson(
  `/api/chats/${chatId}/gemini-key`,
  {
    method: "PATCH",
    body: JSON.stringify({ userId, apiKey }),
  },
)

export const toggleChatAi = (chatId, userId, enabled) => requestJson(
  `/api/chats/${chatId}/group-agent`,
  {
    method: "PATCH",
    body: JSON.stringify({ userId, enabled }),
  },
)
