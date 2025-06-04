import { EventEmitter } from "node:events"

export interface GroupEvent {
  group: any
}

export interface GroupSettingsEvent {
  groupId: number
  settings: any
}

export interface GroupStatusEvent {
  groupId: number
  status: string
}

export interface GroupUserEvent {
  groupId: number
  userId: number
  role: string
}

export interface MessageEvent {
  groupId: number
  userId: number
  messageId: string
  content: string
}

export interface AIRequestEvent {
  groupId: number
  userId: number
  prompt: string
  response?: string
  error?: string
}

export interface EventMap {
  "group:created": GroupEvent
  "group:settings_updated": GroupSettingsEvent
  "group:status_updated": GroupStatusEvent
  "group:user_added": GroupUserEvent
  "group:user_removed": GroupUserEvent
  "message:received": MessageEvent
  "message:sent": MessageEvent
  "ai:request": AIRequestEvent
  "ai:response": AIRequestEvent
  "ai:error": AIRequestEvent
}

export class EventBus extends EventEmitter {
  constructor() {
    super()
    this.setMaxListeners(100) // Увеличиваем лимит слушателей
  }

  emit<K extends keyof EventMap>(event: K, data: EventMap[K]): boolean {
    return super.emit(event, data)
  }

  on<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.on(event, listener)
  }

  once<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.once(event, listener)
  }

  off<K extends keyof EventMap>(event: K, listener: (data: EventMap[K]) => void): this {
    return super.off(event, listener)
  }

  removeAllListeners<K extends keyof EventMap>(event?: K): this {
    return super.removeAllListeners(event)
  }
} 