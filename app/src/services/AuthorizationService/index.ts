import type { IService } from "../../core/Container.js"
import type { Logger } from "../../helpers/Logger.js"
import type { AppConfig } from "../../config.js"
import type { EventBus } from "../../core/EventBus.js"
import type { ChatRepository } from "../../repository/ChatRepository.js"

interface AuthorizationDependencies {
  eventBus?: EventBus
  chatRepository?: ChatRepository
}

export interface AuthorizationResult {
  authorized: boolean
  isSuperAdmin?: boolean
  reason?: string
}

export class AuthorizationService implements IService {
  private config: AppConfig
  private logger: Logger
  private deps: AuthorizationDependencies

  constructor(config: AppConfig, logger: Logger, deps: AuthorizationDependencies = {}) {
    this.config = config
    this.logger = logger
    this.deps = deps
  }

  async initialize(): Promise<void> {
    // No-op: listeners will be added when use-cases are implemented
  }

  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  async dispose(): Promise<void> {}
  isHealthy(): boolean { return true }

  /**
   * Проверка, является ли пользователь суперадминистратором бота
   */
  isSuperAdmin(username?: string): boolean {
    if (!username) {
      return false
    }

    let superAdminUsername = this.config.SUPER_ADMIN_USERNAME

    if (superAdminUsername?.startsWith("@")) {
      superAdminUsername = superAdminUsername.replace("@", "")
    }

    return username === superAdminUsername
  }

  /**
   * Проверка, является ли пользователь администратором группы
   */
  async isGroupAdmin(chatId: number, userId: number): Promise<boolean> {
    try {
      if (!this.deps.chatRepository) {
        this.logger.w("ChatRepository not available for admin check")
        return false
      }

      return await this.deps.chatRepository.isAdmin(chatId, userId)
    } catch (error) {
      this.logger.e("Error checking group admin permission:", error)
      return false
    }
  }

  /**
   * Проверка прав администратора группы (с учетом суперадмина)
   */
  async checkGroupAdmin(chatId: number, userId: number, username?: string): Promise<AuthorizationResult> {
    // Суперадмин имеет доступ ко всем командам
    if (this.isSuperAdmin(username)) {
      return {
        authorized: true,
        isSuperAdmin: true,
      }
    }

    // Проверяем, является ли пользователь администратором группы
    const isAdmin = await this.isGroupAdmin(chatId, userId)

    if (!isAdmin) {
      return {
        authorized: false,
        reason: "no_group_admin_permission",
      }
    }

    return {
      authorized: true,
      isSuperAdmin: false,
    }
  }
}
