import React from "react"

export function WelcomeView({ onStart, loading, disabled }) {
  return (
    <section className="panel">
      <p>Нажмите кнопку, чтобы начать настройку бота Альтрон.</p>
      <button
        className="primary"
        onClick={onStart}
        disabled={disabled || loading}
      >
        {loading ? "Загружаем..." : "Начать"}
      </button>
    </section>
  )
}
