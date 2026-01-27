import React from "react";

export function WelcomeView({ onStart, loading, disabled }) {
  return (
    <section className="panel">
      <p>Нажмите кнопку, чтобы загрузить чаты, где вы администратор.</p>
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

