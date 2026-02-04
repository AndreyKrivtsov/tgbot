import { useEffect, useState } from "react"
import { parseInitData } from "../telegram/parseInitData.js"

export const useTelegramUser = () => {
  const [user, setUser] = useState(/** @type {object | null} */ (null))
  const [userId, setUserId] = useState(/** @type {number | null} */ (null))
  const [error, setError] = useState("")
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const telegram = /** @type {any} */ (window).Telegram?.WebApp
    if (!telegram) {
      setError("Telegram WebApp недоступен")
      setIsReady(true)
      return
    }

    telegram.ready()

    const initData = typeof telegram.initData === "string" ? telegram.initData : ""
    const parsedInitData = initData ? parseInitData(initData) : null
    const initUser = telegram.initDataUnsafe?.user ?? parsedInitData?.user ?? null

    if (initUser?.id) {
      setUser(initUser)
      setUserId(initUser.id)
      setIsReady(true)
      return
    }

    setError("Не удалось получить userId пользователя")
    setIsReady(true)
  }, [])

  return {
    user,
    userId,
    error,
    isReady,
  }
}
