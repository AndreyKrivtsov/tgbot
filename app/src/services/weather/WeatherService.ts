import type { CanvasRenderingContext2D } from "canvas"
import path from "node:path"
import axios from "axios"
import { createCanvas, loadImage } from "canvas"
import { WEATHER_CONFIG } from "../../constants.js"

interface ResponceWeather {
  hourly: {
    temperature_2m: number[]
    apparent_temperature: number[]
    relative_humidity_2m: number[]
    precipitation_probability: number[]
    rain: number[]
    pressure_msl: number[]
    cloud_cover: number[]
    wind_speed_10m: number[]
    wind_direction_10m: number[]
    wind_gusts_10m: number[]
  }
}

interface WeatherData {
  temperature: number
  apparentTemperature: number
  humidity: number
  precipitation: number
  rain: number
  pressure: number
  cloud: number
  windSpeed: number
  windDirection: number
  windGusts: number
}

export class WeatherService {
  isImage = true
  latitude = WEATHER_CONFIG.DEFAULT_LATITUDE
  longitude = WEATHER_CONFIG.DEFAULT_LONGITUDE
  url = `https://api.open-meteo.com/v1/forecast?latitude=${this.latitude}&longitude=${this.longitude}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,rain,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=GMT&forecast_days=1`
  isSent = false

  constructor() {

  }

  async start(action: (weatherText: string | Blob) => void) {
    const date = new Date()
    const hours = date.getUTCHours()
    const localHours = hours + WEATHER_CONFIG.TIMEZONE_OFFSET_HOURS

    if (WEATHER_CONFIG.FORECAST_HOURS.includes(localHours)) {
      if (this.isSent) {
        return
      }

      this.isSent = true
      const weatherText = await this.getWeather(hours)
      action(weatherText)
    } else {
      this.isSent = false
    }

    setTimeout(() => {
      this.start(action)
    }, WEATHER_CONFIG.UPDATE_INTERVAL_MS)
  }

  async getWeather(hour: number) {
    const result = await this.queryWeather()

    if (result) {
      const weather = this.parseWeather(result, hour)
      if (this.isImage) {
        return await this.toImage(weather)
      } else {
        return this.toText(weather)
      }
    }

    return ""
  }

  async toImage(weather: WeatherData) {
    const imagePath = path.join(import.meta.dirname, "image.jpg")
    const initialImage = await loadImage(imagePath)
    const canvas = createCanvas(WEATHER_CONFIG.CANVAS_WIDTH, WEATHER_CONFIG.CANVAS_HEIGHT)

    let ctx = canvas.getContext("2d")
    ctx.drawImage(initialImage, 0, 0)

    ctx = this.title(ctx, 50, "Погода на ближайший час")
    ctx = this.str(ctx, 100, "Температура", `${weather.temperature} °C`)
    ctx = this.str(ctx, 130, "Ощущается как", `${weather.apparentTemperature} °C`)
    ctx = this.str(ctx, 250, "Давление", `${weather.pressure} hPa`)
    ctx = this.str(ctx, 370, "Облачность", `${weather.cloud} %`)
    ctx = this.str(ctx, 280, "Ветер", `${weather.windSpeed} км/ч`)
    ctx = this.str(ctx, 160, "Влажность", `${weather.humidity} %`)
    ctx = this.str(ctx, 220, "Дождь", `${weather.rain} мм`)
    ctx = this.str(ctx, 190, "Вероятность дождя", `${weather.precipitation} %`)
    ctx = this.str(ctx, 340, "Порывы ветра", `${weather.windGusts} км/ч`)
    ctx = this.str(ctx, 310, "Направление ветра", `${weather.windDirection} °`)

    const image = new Blob([canvas.toBuffer("image/png")])
    return image
  }

  title(ctx: CanvasRenderingContext2D, y: number, str: string) {
    return this.text(ctx, 40, y, "#fff", str, 22)
  }

  str(ctx: CanvasRenderingContext2D, y: number, title: string, str: string) {
    this.text(ctx, 50, y, "#aaa", `${title}`, 20)
    return this.text(ctx, 255, y, "#fff", str, 20)
  }

  text(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, value: string, size: number) {
    ctx.fillStyle = color
    ctx.font = `${size}px tahoma`
    ctx.fillText(value, x, y)
    return ctx
  }

  toText(weather: WeatherData) {
    let text = `\n\n🌤 <b>Погода на ближайший час:</b>\n\n`
    text += `Температура: <b>${weather.temperature} °C</b>\n`
    text += `Ощущается как: <b>${weather.apparentTemperature} °C</b>\n`
    text += `Влажность: <b>${weather.humidity} %</b>\n`
    text += `Вероятность осадков: <b>${weather.precipitation} %</b>\n`
    text += `Дождь: <b>${weather.rain} мм</b>\n`
    text += `Давление: <b>${weather.pressure} hPa</b>\n`
    text += `Ветер: <b>${weather.windSpeed} км/ч</b>\n`
    text += `Направление ветра: <b>${weather.windDirection} °</b>\n`
    text += `Порывы ветра: <b>${weather.windGusts} км/ч</b>\n`
    text += `Облачность: <b>${weather.cloud} %</b>\n\n`

    return text
  }

  async queryWeather(): Promise<ResponceWeather | null> {
    try {
      const result = await axios.get(this.url)
      if (result && result.status === 200) {
        return result.data
      }

      return null
    }
    catch (e) {
      console.error("Ошибка получения температуры", e)
      return null
    }
  }

  parseWeather(weather: ResponceWeather, hour: number): WeatherData {
    return {
      temperature: weather.hourly.temperature_2m[hour] ?? 0,
      apparentTemperature: weather.hourly.apparent_temperature[hour] ?? 0,
      humidity: weather.hourly.relative_humidity_2m[hour] ?? 0,
      precipitation: weather.hourly.precipitation_probability[hour] ?? 0,
      rain: weather.hourly.rain[hour] ?? 0,
      pressure: weather.hourly.pressure_msl[hour] ?? 0,
      cloud: weather.hourly.cloud_cover[hour] ?? 0,
      windSpeed: weather.hourly.wind_speed_10m[hour] ?? 0,
      windDirection: weather.hourly.wind_direction_10m[hour] ?? 0,
      windGusts: weather.hourly.wind_gusts_10m[hour] ?? 0,
    }
  }
}
