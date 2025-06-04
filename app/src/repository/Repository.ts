import type { Logger } from "../types.d.ts"
import { UserRepository } from "./UserRepository.js"

export class Repository {
  logger: Logger
  userRepository: UserRepository
  chatRepository: any // TODO: Define the type for chatRepository

  constructor(logger: Logger) {
    this.logger = logger
    this.userRepository = new UserRepository()
    this.chatRepository = {} // Initialize chatRepository with an empty object or a specific class
    // this.chatRepository = new ChatRepository() // Uncomment if you have a ChatRepository class
    console.log("Repository initialized")
  }

  init() {
    console.log("Repository initialized")
  }

  getUsersRepository() {
    return this.userRepository
  }

  getChatRepository() {
    return this.chatRepository
  }
}
