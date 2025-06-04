type RestrictType = "antihate" | "mute"

type RestrictTypeList = Record<RestrictType, RestrictType>

interface UserConfig {
  id: number
  userId: number
  chatRestrict: { [ chatId: number ]: RestrictTypeList }
}

export class UserConfigRepository {
  private userConfig: { [ userId: number ]: UserConfig } = {}

  constructor() {
    if (!this.userConfig) {
      this.userConfig = {}
    }
    this.userConfig = {}
  }

  initUserConfig(userId: number) {
    if (!this.userConfig[userId]) {
      this.userConfig[userId] = {
        id: userId,
        userId,
        chatRestrict: {},
      }
    }
  }

  addRestrict(userId: number, chatId: number, restrictType: RestrictType) {
    this.initUserConfig(userId)

    const restrictList = this.getUserConfig(userId)?.chatRestrict[chatId]
    if (restrictList) {
      restrictList[restrictType] = restrictType
    }
  }

  removeAllRestricts(userId: number, chatId: number) {
    this.initUserConfig(userId)
    const userConfig = this.getUserConfig(userId)
    if (userConfig) {
      delete userConfig.chatRestrict[chatId]
    }
  }

  getUserConfig(userId: number): UserConfig | undefined {
    return this.userConfig[userId]
  }

  deleteUserConfig(userId: number) {
    delete this.userConfig[userId]
  }
}
