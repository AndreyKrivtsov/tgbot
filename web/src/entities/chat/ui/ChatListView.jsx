import React from "react"

export function ChatListView({ chats, onSelectChat, onBack }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Ваши чаты</h2>
        <p>В списке указаны чаты, которые зарегистрированы в боте Альтрон и в которых вы администратор.</p>
        <p>Выберите чат, чтобы настроить его.</p>
      </div>

      {chats.length === 0 ? (
        <>
          <p>Нет чатов, где вы администратор.</p>
        </>
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

      <button className="ghost" style={{ marginTop: "24px" }} onClick={onBack}>
        Назад
      </button>
    </section>
  )
}
