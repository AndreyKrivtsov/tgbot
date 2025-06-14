#!/usr/bin/env node

import { readFileSync } from "node:fs"
import { spawn } from "node:child_process"

// Определяем какой .env файл использовать
const nodeEnv = process.env.NODE_ENV || "development"
const envFile = nodeEnv === "production" ? ".env.production" : ".env"

console.log(`🔧 Running migrations in ${nodeEnv} mode`)
console.log(`📁 Loading environment from: ${envFile}`)

// Загружаем переменные из соответствующего файла
try {
  const envContent = readFileSync(envFile, "utf8")
  const envVars = envContent.split("\n").reduce((acc, line) => {
    const cleanLine = line.trim()
    if (cleanLine && !cleanLine.startsWith("#")) {
      const equalIndex = cleanLine.indexOf("=")
      if (equalIndex > 0) {
        const key = cleanLine.substring(0, equalIndex).trim()
        const value = cleanLine.substring(equalIndex + 1).trim()
        // Удаляем кавычки если они есть
        const cleanValue = value.replace(/^['"]|['"]$/g, "")
        acc[key] = cleanValue
      }
    }
    return acc
  }, {})

  // Устанавливаем переменные окружения
  Object.assign(process.env, envVars)

  console.log(`✅ Loaded ${Object.keys(envVars).length} environment variables`)
} catch (error) {
  console.error(`❌ Error loading ${envFile}:`, error.message)
  process.exit(1)
}

// Получаем команду из аргументов
const command = process.argv[2] || "migrate"
const validCommands = ["migrate", "generate", "push", "studio", "drop"]

if (!validCommands.includes(command)) {
  console.error(`❌ Invalid command: ${command}`)
  console.error(`Valid commands: ${validCommands.join(", ")}`)
  process.exit(1)
}

console.log(`🚀 Running drizzle-kit ${command}...`)

// Запускаем drizzle-kit с нужной командой
const drizzleProcess = spawn("npx", ["drizzle-kit", command], {
  stdio: "inherit",
  env: process.env,
})

drizzleProcess.on("close", (code) => {
  if (code === 0) {
    console.log(`✅ drizzle-kit ${command} completed successfully`)
  } else {
    console.error(`❌ drizzle-kit ${command} failed with code ${code}`)
    process.exit(code)
  }
}) 