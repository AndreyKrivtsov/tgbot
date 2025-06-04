import type { Logger } from "../helpers/Logger.ts"
import type { Repository } from "../types.js"

export interface WebInterface {
  logger: Logger
  repository: Repository
  start: () => void
}

export class Web implements WebInterface {
  logger: Logger
  repository: Repository

  constructor(logger: Logger, repository: Repository) {
    this.logger = logger
    this.repository = repository
  }

  start() {
    console.log("Web app initialized")
  }
}
