import React from "react"
import { useCallback, useEffect, useMemo, useState } from "react"
import "./App.css"
import { WelcomeView } from "../widgets/WelcomeView.jsx"
import { ChatListView } from "../entities/chat/ui/ChatListView.jsx"
import { ChatSettingsView } from "../entities/chat/ui/ChatSettingsView.jsx"
import { useTelegramUser } from "../shared/hooks/useTelegramUser.js"
import { useLoadChats } from "../features/chat/loadChats/model/useLoadChats.js"
import { useSyncAdmins } from "../features/chat/syncAdmins/model/useSyncAdmins.js"
import { useUpdateApiKey } from "../features/chat/updateApiKey/model/useUpdateApiKey.js"
import { useToggleAi } from "../features/chat/toggleAi/model/useToggleAi.js"

/** @typedef {import("../entities/chat/model/types").Chat} Chat */

const Views = {
  WELCOME: "welcome",
  CHATS: "chats",
  CHAT_SETTINGS: "chatSettings",
}

function App() {
  const [view, setView] = useState(Views.WELCOME)
  const { userId, error: userError } = useTelegramUser()
  const [chats, setChats] = useState(/** @type {Chat[]} */ ([]))
  const [selectedChatId, setSelectedChatId] = useState(null)
  const [status, setStatus] = useState({ type: "", message: "" })

  const { loadChats, loading: loadingChats } = useLoadChats({ userId })
  const { syncAdmins, loading: syncingAdmins } = useSyncAdmins()
  const { updateApiKey, loading: updatingApiKey } = useUpdateApiKey()
  const { toggleAi, loading: togglingAi } = useToggleAi()

  const actionLoading = syncingAdmins || updatingApiKey || togglingAi

  useEffect(() => {
    if (userError) {
      setStatus({ type: "error", message: userError })
    }
  }, [userError])

  const selectedChat = useMemo(
    () => chats.find(chat => chat.id === selectedChatId) ?? null,
    [chats, selectedChatId],
  )

  const handleLoadChats = useCallback(async () => {
    setStatus({ type: "", message: "" })

    try {
      const data = await loadChats()
      setChats(data.chats ?? [])
      setView(Views.CHATS)
      setStatus({
        type: "success",
        message: `Найдено ${data.chats?.length ?? 0} чатов`,
      })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
    }
  }, [loadChats])

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

    try {
      await syncAdmins({ chatId: selectedChat.id, userId })
      setStatus({ type: "success", message: "Список админов обновлён" })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
    }
  }

  const handleUpdateApiKey = async () => {
    if (!selectedChat || !userId) return

    const nextKey = window.prompt("Введите API ключ Gemini (оставьте пустым чтобы удалить):", "")
    if (nextKey === null) {
      return
    }

    const apiKey = nextKey.trim() === "" ? null : nextKey.trim()

    try {
      await updateApiKey({
        chatId: selectedChat.id,
        userId,
        apiKey,
      })
      setStatus({ type: "success", message: apiKey ? "API ключ обновлён" : "API ключ удалён" })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
    }
  }

  const handleToggleAi = async (enabled) => {
    if (!selectedChat || !userId) return

    try {
      await toggleAi({ chatId: selectedChat.id, userId, enabled })
      updateChatInList(selectedChat.id, { aiEnabled: enabled })
      setStatus({
        type: "success",
        message: enabled ? "ИИ включён" : "ИИ выключен",
      })
    } catch (error) {
      setStatus({ type: "error", message: error.message })
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
          onStart={handleLoadChats}
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
