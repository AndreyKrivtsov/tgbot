import React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import "./App.css"
import { WelcomeView } from "./views/WelcomeView.jsx"
import { ChatListView } from "./views/ChatListView.jsx"
import { ChatSettingsView } from "./views/ChatSettingsView.jsx"

const Views = {
  WELCOME: "welcome",
  CHATS: "chats",
  CHAT_SETTINGS: "chatSettings",
}

function App() {
  const [view, setView] = useState(Views.WELCOME)
  const [userId, setUserId] = useState(null)
  const [chats, setChats] = useState([])
  const [selectedChatId, setSelectedChatId] = useState(null)
  const [loadingChats, setLoadingChats] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const [status, setStatus] = useState({ type: "", message: "" })

  useEffect(() => {
    const telegram = window.Telegram?.WebApp
    if (!telegram) {
      setStatus({ type: "error", message: "Telegram WebApp недоступен" })
      return
    }

    telegram.ready()
    const initUserId = telegram.initDataUnsafe?.user?.id
    if (initUserId) {
      setUserId(initUserId)
      return
    }

    const fallbackUserId = Number(new URLSearchParams(window.location.search).get("userId"))
    if (Number.isFinite(fallbackUserId)) {
      setUserId(fallbackUserId)
      return
    }

    setStatus({ type: "error", message: "Не удалось получить userId пользователя" })
  }, [])

  const callApi = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
      ...options,
    })

    let data = {}
    try {
      data = await response.json()
    } catch {
      // ignore empty body
    }

    if (!response.ok || data.success === false) {
      const errorMessage = data.error || `Ошибка ${response.status}`
      throw new Error(errorMessage)
    }

    return data
  }, [])

  const selectedChat = useMemo(
    () => chats.find(chat => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  const loadChats = useCallback(async () => {
    if (!userId) {
      setStatus({ type: "error", message: "userId ещё не готов" })
      return
    }

    setLoadingChats(true)
    setStatus({ type: "", message: "" })

    try {
      const data = await callApi(`/api/users/${userId}/chats`)
      setChats(data.chats ?? [])
      setView(Views.CHATS)
      setStatus({
        type: "success",
        message: `Найдено ${data.chats?.length ?? 0} чатов`,
      })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
    } finally {
      setLoadingChats(false)
    }
  }, [callApi, userId])

  const updateChatInList = useCallback((chatId, patch) => {
    setChats(prev => prev.map(chat => (
      chat.id === chatId ? { ...chat, ...patch } : chat
    )))
  }, [])

  const handleChatClick = (chat) => {
    setSelectedChatId(chat.id)
    setView(Views.CHAT_SETTINGS)
  }

  const handleSyncAdmins = async () => {
    if (!selectedChat || !userId) return

    setActionLoading(true)
    try {
      await callApi(`/api/chats/${selectedChat.id}/admins/sync`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      })
      setStatus({ type: "success", message: "Список админов обновлён" })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
    } finally {
      setActionLoading(false)
    }
  }

  const handleUpdateApiKey = async () => {
    if (!selectedChat || !userId) return

    const nextKey = window.prompt("Введите API ключ Gemini (оставьте пустым чтобы удалить):", "")
    if (nextKey === null) {
      return
    }

    const apiKey = nextKey.trim() === "" ? null : nextKey.trim()

    setActionLoading(true)
    try {
      await callApi(`/api/chats/${selectedChat.id}/gemini-key`, {
        method: "PATCH",
        body: JSON.stringify({ userId, apiKey }),
      })
      setStatus({ type: "success", message: apiKey ? "API ключ обновлён" : "API ключ удалён" })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
    } finally {
      setActionLoading(false)
    }
  }

  const handleToggleAi = async (enabled) => {
    if (!selectedChat || !userId) return

    setActionLoading(true)
    try {
      await callApi(`/api/chats/${selectedChat.id}/group-agent`, {
        method: "PATCH",
        body: JSON.stringify({ userId, enabled }),
      })
      updateChatInList(selectedChat.id, { aiEnabled: enabled })
      setStatus({
        type: "success",
        message: enabled ? "ИИ включён" : "ИИ выключен",
      })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div className="app">
      <header className="panel">
        <h1>Ultron Control</h1>
        <p>Управляйте настройками ИИ и администрированием прямо из Telegram Mini App.</p>
      </header>

      {view === Views.WELCOME && (
        <WelcomeView
          onStart={loadChats}
          loading={loadingChats}
          disabled={!userId}
        />
      )}

      {view === Views.CHATS && (
        <ChatListView
          chats={chats}
          onSelectChat={handleChatClick}
          onBack={() => setView(Views.WELCOME)}
        />
      )}

      {view === Views.CHAT_SETTINGS && selectedChat && (
        <ChatSettingsView
          chat={selectedChat}
          busy={actionLoading}
          onBack={() => setView(Views.CHATS)}
          onUpdateAdmins={handleSyncAdmins}
          onUpdateApiKey={handleUpdateApiKey}
          onToggleAi={handleToggleAi}
        />
      )}

      {status.message && (
        <div className={`status ${status.type}`}>
          {status.message}
        </div>
      )}
    </div>
  )
}

export default App
