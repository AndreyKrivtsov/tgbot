import { useCallback, useState } from "react"
import { updateChatApiKey } from "../../../../entities/chat/api/chatsApi.js"

export const useUpdateApiKey = () => {
  const [loading, setLoading] = useState(false)

  const updateApiKey = useCallback(async ({ chatId, userId, apiKey }) => {
    setLoading(true)
    try {
      await updateChatApiKey(chatId, userId, apiKey)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    updateApiKey,
    loading,
  }
}
