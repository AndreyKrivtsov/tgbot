export interface User {
  id: number
  username?: string
  firstname: string
  messages: number
  sessionId: string
}

export class Users {
  users: Record<User["id"], User>

  constructor() {
    this.users = {}
  }

  newUser(user: Omit<User, "messages" | "sessionId">) {
    const sessionId = this.createSessionId()

    this.users[user.id] = {
      id: user.id,
      username: user.username,
      firstname: user.firstname,
      messages: 0,
      sessionId,
    }

    return this.users[user.id]
  }

  getUser(userId: number) {
    return this.users[userId]
  }

  deleteUser(userId: number) {
    if (this.exist(userId)) {
      delete this.users[userId]
    }
  }

  exist(userId: number): boolean {
    return !!this.users[userId]
  }

  increaseMessages(userId: number) {
    if (this.users[userId]) {
      this.users[userId].messages += 1
    }
  }

  createSessionId() {
    const idLength = 24
    return Array
      .from<number>({ length: idLength })
      .fill(idLength)
      .map(value => value * Math.random())
      .map(value => Math.floor(value).toString(16))
      .join("")
  }
}
