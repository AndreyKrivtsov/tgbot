interface UserData {
  id: number
  sessionId: string
}

export class Users {
  users: Record<UserData["id"], UserData>

  constructor() {
    this.users = {}
  }

  newUser(userId: number) {
    const sessionId = this.createSessionId()
    this.users[userId] = {
      id: userId,
      sessionId,
    }

    return this.users[userId]
  }

  getUser(userId: number) {
    return this.users[userId]
  }

  deleteUser(userId: number) {
    delete this.users[userId]
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
