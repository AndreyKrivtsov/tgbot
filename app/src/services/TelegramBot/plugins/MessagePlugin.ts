import type { TelegramMessageContext } from "../types/index.js"

export interface MessagePlugin {
  name: string
  priority: number
  canHandle: (context: TelegramMessageContext) => boolean
  handle: (context: TelegramMessageContext) => Promise<boolean>
}

export abstract class BaseMessagePlugin implements MessagePlugin {
  abstract name: string
  abstract priority: number
  abstract canHandle(context: TelegramMessageContext): boolean
  abstract handle(context: TelegramMessageContext): Promise<boolean>
}
