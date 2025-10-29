export type ServiceFactory<T = any> = () => T | Promise<T>
export type ServiceInstance<T = any> = T

export interface IService {
  initialize?: () => Promise<void>
  start?: () => Promise<void>
  stop?: () => Promise<void>
  dispose?: () => Promise<void>
}

/**
 * Контейнер зависимостей для управления сервисами приложения
 */
export class Container {
  private services = new Map<string, ServiceInstance>()
  private factories = new Map<string, ServiceFactory>()
  private initialized = new Set<string>()
  private started = new Set<string>()

  constructor() {}

  /**
   * Регистрация сервиса или фабрики
   */
  register<T>(name: string, serviceOrFactory: T | ServiceFactory<T>): void {
    if (typeof serviceOrFactory === "function") {
      this.factories.set(name, serviceOrFactory as ServiceFactory<T>)
    }
    else {
      this.services.set(name, serviceOrFactory)
    }
  }

  /**
   * Получение сервиса по имени
   */
  get<T>(name: string): T {
    // Сначала проверяем уже созданные экземпляры
    if (this.services.has(name)) {
      return this.services.get(name) as T
    }

    // Затем пытаемся создать из фабрики
    if (this.factories.has(name)) {
      const factory = this.factories.get(name)!
      const instance = factory()

      // Если фабрика возвращает Promise, выбрасываем ошибку
      if (instance instanceof Promise) {
        throw new TypeError(`Service "${name}" factory returns Promise. Use getAsync() instead.`)
      }

      this.services.set(name, instance)
      this.factories.delete(name) // Удаляем фабрику после создания
      return instance as T
    }

    throw new Error(`Service "${name}" not found`)
  }

  /**
   * Асинхронное получение сервиса
   */
  async getAsync<T>(name: string): Promise<T> {
    // Сначала проверяем уже созданные экземпляры
    if (this.services.has(name)) {
      return this.services.get(name) as T
    }

    // Затем пытаемся создать из фабрики
    if (this.factories.has(name)) {
      const factory = this.factories.get(name)!
      const instance = await factory()

      this.services.set(name, instance)
      this.factories.delete(name) // Удаляем фабрику после создания
      return instance as T
    }

    throw new Error(`Service "${name}" not found`)
  }

  /**
   * Проверка существования сервиса
   */
  has(name: string): boolean {
    return this.services.has(name) || this.factories.has(name)
  }

  /**
   * Инициализация всех сервисов
   */
  async initialize(): Promise<void> {
    // Создаем экземпляры из всех фабрик
    const factoryNames = Array.from(this.factories.keys())
    for (const name of factoryNames) {
      await this.getAsync(name)
    }

    // Инициализируем все сервисы
    for (const [name, service] of this.services) {
      if (this.isService(service) && service.initialize && !this.initialized.has(name)) {
        await service.initialize()
        this.initialized.add(name)
      }
    }
  }

  /**
   * Запуск всех сервисов
   */
  async start(): Promise<void> {
    for (const [name, service] of this.services) {
      if (this.isService(service) && service.start && !this.started.has(name)) {
        await service.start()
        this.started.add(name)
      }
    }
  }

  /**
   * Остановка всех сервисов
   */
  async stop(): Promise<void> {
    // Останавливаем в обратном порядке
    const startedServices = Array.from(this.started).reverse()

    for (const name of startedServices) {
      const service = this.services.get(name)
      if (service && this.isService(service) && service.stop) {
        try {
          await service.stop()
          this.started.delete(name)
        }
        catch {
          // Игнорируем ошибки при остановке
        }
      }
    }
  }

  /**
   * Освобождение ресурсов
   */
  async dispose(): Promise<void> {
    for (const [_name, service] of this.services) {
      if (this.isService(service) && service.dispose) {
        try {
          await service.dispose()
        }
        catch {
          // Игнорируем ошибки при освобождении ресурсов
        }
      }
    }

    this.services.clear()
    this.factories.clear()
    this.initialized.clear()
    this.started.clear()
  }

  /**
   * Получение списка всех зарегистрированных сервисов
   */
  getServiceNames(): string[] {
    return [
      ...Array.from(this.services.keys()),
      ...Array.from(this.factories.keys()),
    ]
  }

  /**
   * Проверка, является ли объект сервисом
   */
  private isService(obj: any): obj is IService {
    return obj != null && typeof obj === "object"
  }
}
