import type { WeatherService } from "../../services/weather/WeatherService.js"
import type { AppConfig, Bot } from "../../types.d.js"

export class StartController {
  config: AppConfig
  bot: Bot
  weatherService: WeatherService

  constructor(config: AppConfig, bot: Bot, weatherService: WeatherService) {
    this.config = config
    this.bot = bot
    this.weatherService = weatherService
  }

  run() {
    if (!this.bot.info) {
      return
    }

    console.log(`\n\n ===== \n\n✨ Bot ${this.bot.info?.username} was started!\n\n Version 0.7 \n\n ===== \n\n`)

    // this.weatherService.start((data) => {
    //   this.bot.api.sendPhoto({ chat_id: this.config.DEFAULT_CHAT_ID, photo: data, caption: "#погода", show_caption_above_media: true })
    // })
  }
}
