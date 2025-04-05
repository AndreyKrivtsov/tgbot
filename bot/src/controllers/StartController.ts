import type { Bot } from "gramio"
import type { WeatherService } from "../services/weather/WeatherService.js"
import { config } from "../config.js"

export class StartController {
  bot: Bot
  weatherService: WeatherService

  constructor(bot: Bot, weatherService: WeatherService) {
    this.bot = bot
    this.weatherService = weatherService
  }

  run() {
    if (!this.bot.info) {
      return
    }

    console.log(`\n\n ===== \n\n✨ Bot ${this.bot.info?.username} was started!\n\n Version 0.7 \n\n ===== \n\n`)

    this.weatherService.start((data) => {
      this.bot.api.sendPhoto({ chat_id: config.DEFAULT_CHAT_ID, photo: data, caption: "#погода", show_caption_above_media: true })
    })
  }
}
