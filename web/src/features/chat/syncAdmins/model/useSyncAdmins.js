import { useCallback, useState } from "react"
import { syncChatAdmins } from "../../../../entities/chat/api/chatsApi.js"

export const useSyncAdmins = () => {
  const [loading, setLoading] = useState(false)

  const syncAdmins = useCallback(async ({ chatId, userId }) => {
    setLoading(true)
    try {
      await syncChatAdmins(chatId, userId)
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    syncAdmins,
    loading,
  }
}
