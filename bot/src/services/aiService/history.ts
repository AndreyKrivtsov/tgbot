import type { Content } from "@google/generative-ai"
import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { config } from "../../config.js"

export async function saveHistory(contextId: string, context: Content[]) {
  try {
    const filePath = getFilePath(`context-${contextId}.json`)
    const data = JSON.stringify(context)

    await writeFile(filePath, data, { encoding: "utf-8" })
  } catch (e) {
    console.error(e)
    return null
  }
}

export async function loadHistory(contextId: string): Promise<Content[] | null> {
  try {
    const filePath = getFilePath(`context-${contextId}.json`)
    const data = await readFile(filePath, { encoding: "utf-8" })

    if (data) {
      return JSON.parse(data)
    }

    return null
  } catch (e) {
    console.error(e)
    return null
  }
}

function getFilePath(fileName: string) {
  let filePath = path.join(process.cwd(), fileName)

  if (config.LOG_DIR) {
    filePath = path.join(config.LOG_DIR, fileName)
  }

  return filePath
}
