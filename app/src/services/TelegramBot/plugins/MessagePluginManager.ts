import type { Logger } from "../../../helpers/Logger.js"
import type { EventBus } from "../../../core/EventBus.js"
import type { TelegramMessageContext } from "../types/index.js"
import type { MessagePlugin } from "./MessagePlugin.js"

export class MessagePluginManager {
  private plugins: MessagePlugin[] = []
  private logger: Logger
  private eventBus: EventBus

  constructor(logger: Logger, eventBus: EventBus) {
    this.logger = logger
    this.eventBus = eventBus
  }

  registerPlugin(plugin: MessagePlugin): void {
    this.plugins.push(plugin)
    this.plugins.sort((a, b) => a.priority - b.priority)
    this.logger.d(`Plugin '${plugin.name}' registered`)
  }

  async processMessage(context: TelegramMessageContext): Promise<void> {
    for (const plugin of this.plugins) {
      if (plugin.canHandle(context)) {
        const handled = await plugin.handle(context)
        if (handled)
          break
      }
    }
  }
}
