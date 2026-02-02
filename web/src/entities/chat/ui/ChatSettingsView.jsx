import React from "react"

export function ChatSettingsView({
  chat,
  busy,
  onBack,
  onUpdateAdmins,
  onUpdateApiKey,
  onToggleAi,
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <button className="ghost" onClick={onBack}>
          ← Назад
        </button>
        <h2>{chat.title || "Настройки чата"}</h2>
      </div>

      <p className="chat-meta">ID: {chat.id}</p>

      <div className="actions">
        <button className="primary" onClick={onUpdateApiKey} disabled={busy}>
          Обновить API ключ
        </button>

        <button className="primary" onClick={onUpdateAdmins} disabled={busy}>
          Обновить список администраторов
        </button>

        <label className="toggle" htmlFor="ai-toggle">
          <input
            id="ai-toggle"
            type="checkbox"
            checked={chat.aiEnabled}
            onChange={(event) => onToggleAi(event.target.checked)}
            disabled={busy}
          />
          <span>Включить ИИ</span>
        </label>
      </div>
    </section>
  )
}
