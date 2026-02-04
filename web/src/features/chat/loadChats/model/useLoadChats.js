import { useCallback, useState } from "react"
import { getUserChats } from "../../../../entities/chat/api/chatsApi.js"

export const useLoadChats = ({ userId }) => {
  const [loading, setLoading] = useState(false)

  const loadChats = useCallback(async () => {
    if (!userId) {
      throw new Error("userId ещё не готов")
    }

    setLoading(true)
    try {
      return await getUserChats(userId)
    } finally {
      setLoading(false)
    }
  }, [userId])

  return {
    loadChats,
    loading,
  }
}
