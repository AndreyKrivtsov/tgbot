import type { Logger } from "../helpers/Logger.ts"

export interface WebInterface {
  logger: Logger
  start: () => void
}

export class Web implements WebInterface {
  logger: Logger

  constructor(logger: Logger) {
    this.logger = logger
  }

  start() {
    console.log("Web app initialized")
  }
}
