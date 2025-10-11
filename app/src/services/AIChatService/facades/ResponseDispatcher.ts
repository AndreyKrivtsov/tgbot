import type { Logger } from "../../helpers/Logger.js"

export type EmitFn = (contextId: string, response: string, messageId: number, userMessageId?: number, isError?: boolean) => void

export class ResponseDispatcher {
  private logger: Logger
  private emit?: EmitFn

  constructor(logger: Logger, emit?: EmitFn) {
    this.logger = logger
    this.emit = emit
  }

  emitSuccess(contextId: string, text: string, messageId: number, userMessageId?: number): void {
    if (!this.emit)
      return
    try {
      this.emit(contextId, text, messageId, userMessageId, false)
    } catch (error) {
      this.logger.e("ResponseDispatcher emitSuccess error:", error)
    }
  }

  emitError(contextId: string, errorText: string, messageId: number, userMessageId?: number): void {
    if (!this.emit)
      return
    try {
      this.emit(contextId, errorText, messageId, userMessageId, true)
    } catch (error) {
      this.logger.e("ResponseDispatcher emitError error:", error)
    }
  }
}


