import React from "react"

export function ChatListView({ chats, onSelectChat, onBack }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Ваши чаты</h2>
        <button className="ghost" onClick={onBack}>
          Попробовать снова
        </button>
      </div>

      {chats.length === 0 ? (
        <p>Нет чатов, где вы администратор.</p>
      ) : (
        <ul className="chat-list">
          {chats.map(chat => (
            <li key={chat.id}>
              <button className="chat-item" onClick={() => onSelectChat(chat)}>
                <div>
                  <strong>{chat.title || `Чат ${chat.id}`}</strong>
                  <small>#{chat.id}</small>
                </div>
                <span className={`badge ${chat.aiEnabled ? "on" : "off"}`}>
                  {chat.aiEnabled ? "ИИ включён" : "ИИ выключен"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
