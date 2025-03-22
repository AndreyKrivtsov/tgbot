import { appendFile } from "node:fs/promises"
import path from "node:path"
import { config } from "../config.js"

const LOG_FILE_NAME = "bot.log"
const LOG_FILE_PATH = path.join(process.cwd(), LOG_FILE_NAME)

export class Log {
  token: string
  logLevel: number
  filePath: string
  useFile: boolean

  constructor(token: string, params?: { logLevel?: number, useFile: boolean }) {
    this.token = token
    this.logLevel = params && params?.logLevel ? params.logLevel : config.LOG_LEVEL
    this.filePath = LOG_FILE_PATH
    this.useFile = params && params?.useFile ? params.useFile : true
  }

  i(...data: any[]) {
    if (this.logLevel < 1) {
      console.info(this.getPrefix(), ...data)
      try {
        const joinedData = data.join(" ")
        this.writeToFile(joinedData)
      } catch (e) {
        this.e(e)
      }
    }
  }

  l(...data: any[]) {
    if (this.logLevel < 2) {
      console.log(`[${this.getTime()}]${this.token}:`, ...data)
      try {
        const joinedData = data.join(" ")
        this.writeToFile(joinedData)
      } catch (e) {
        this.e(e)
      }
    }
  }

  e(...data: any[]) {
    console.error(`[${this.getTime()}]${this.token}:`, ...data)
    try {
      const joinedData = data.join(" ")
      this.writeToFile(joinedData)
    } catch (e) {
      this.e(e)
    }
  }

  getPrefix() {
    return `[${this.getTime()}]${this.token}:`
  }

  getTime() {
    const data = new Date()
    return data.toLocaleTimeString()
  }

  writeToFile(text: string) {
    try {
      if (config.LOG_FILE) {
        appendFile(this.filePath, `${this.getPrefix()} ${text}\n`)
      }
    } catch (e) {
      this.e(e)
    }
  }
}
