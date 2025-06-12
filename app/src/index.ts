import { createApp } from "./app.js"

/**
 * Главная точка входа приложения
 */
async function main(): Promise<void> {
  const app = await createApp()
  await app.run()
}

// Запускаем приложение
main().catch((error) => {
  console.error("💀 Fatal error:", error)
  process.exit(1)
})
