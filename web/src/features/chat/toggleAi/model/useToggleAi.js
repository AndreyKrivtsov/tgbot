import { useCallback, useState } from "react"
import { toggleChatAi } from "../../../../entities/chat/api/chatsApi.js"

export const useToggleAi = () => {
  const [loading, setLoading] = useState(false)

  const toggleAi = useCallback(async ({ chatId, userId, enabled }) => {
    setLoading(true)
    try {
      await toggleChatAi(chatId, userId, enabled)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    toggleAi,
    loading,
  }
}
