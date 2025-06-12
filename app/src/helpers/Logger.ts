import { appendFile } from "node:fs/promises"
import path from "node:path"
import { config } from "../config.js"

interface LogParameters {
  logLevel?: number
  filename?: string
  filePath?: string
  useFile?: boolean
}

const DEFAULT_LOG_LEVEL = 2
const DEFAULT_LOG_NAME = "bot.log"
const DEFAULT_LOG_DIR = process.cwd()

export class Logger {
  token: string
  logLevel: number
  filename: string
  filePath: string
  useFile: boolean

  constructor(token: string, params?: LogParameters) {
    this.token = token

    this.logLevel = config.LOG_LEVEL ? config.LOG_LEVEL : DEFAULT_LOG_LEVEL
    this.filename = config.LOG_NAME ? config.LOG_NAME : DEFAULT_LOG_NAME
    this.filePath = config.LOG_DIR ? config.LOG_DIR : DEFAULT_LOG_DIR
    this.useFile = config.LOG_USE_FILE

    if (params) {
      this.logLevel = params.logLevel ? params.logLevel : this.logLevel
      this.filename = params.filename ? params.filename : this.filename
      this.filePath = params.filePath ? params.filePath : this.filePath
      this.useFile = params.useFile ? params.useFile : this.useFile
    }
  }

  /**
   * Debug level logging (level 3)
   */
  d(...data: any[]) {
    if (this.logLevel > 2) {
      console.debug(this.getPrefix("DEBUG"), ...data)
      this.writeToFile("DEBUG", ...data)
    }
  }

  /**
   * Info level logging (level 2)
   */
  i(...data: any[]) {
    if (this.logLevel > 1) {
      console.info(this.getPrefix("INFO"), ...data)
      this.writeToFile("INFO", ...data)
    }
  }

  /**
   * Log level logging (level 1)
   */
  l(...data: any[]) {
    if (this.logLevel > 0) {
      console.log(this.getPrefix("LOG"), ...data)
      this.writeToFile("LOG", ...data)
    }
  }

  /**
   * Error level logging (always shown)
   */
  e(...data: any[]) {
    console.error(this.getPrefix("ERROR"), ...data)
    this.writeToFile("ERROR", ...data)
  }

  /**
   * Warning level logging (level 1)
   */
  w(...data: any[]) {
    if (this.logLevel > 0) {
      console.warn(this.getPrefix("WARN"), ...data)
      this.writeToFile("WARN", ...data)
    }
  }

  writeFileError(...data: any[]) {
    console.error(this.getPrefix("FILE_ERROR"), ...data)
  }

  writeToFile(level: string, ...data: any) {
    if (!this.useFile) {
      return
    }

    try {
      const text = data.map((item: any) => typeof item === "object" ? `\n${JSON.stringify(item)}\n` : item).join(", ")
      const filepath = path.join(this.filePath, this.filename)
      appendFile(filepath, `${this.getPrefix(level)} ${text}\n`)
        .catch(e => this.writeFileError(e))
    }
    catch (e) {
      this.writeFileError(e)
    }
  }

  getPrefix(level?: string) {
    const levelStr = level ? `[${level}]` : ""
    return `[${this.getDate()}][${this.token}]${levelStr}:`
  }

  getDate() {
    const data = new Date()
    return `${data.toLocaleDateString()} ${data.toLocaleTimeString()}`
  }
}
