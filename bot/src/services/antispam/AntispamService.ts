import type { AppConfig } from "../../config.js"
import axios from "axios"

export class AntispamService {
  config: AppConfig

  constructor(config: AppConfig) {
    this.config = config
  }

  async check(text: string) {
    try {
      const result = await axios.post(this.config.ANTISPAM_URL, { text })

      if (result.status === 200) {
        return result.data.is_spam
      } else {
        return null
      }
    } catch (e) {
      const _e = e as unknown as { message: string }
      console.error("Ошибка запроса к AntispamService")
      console.error(_e.message)
      return null
    }
  }
}
