import type { CanvasRenderingContext2D } from "canvas"
import path from "node:path"
import axios from "axios"
import { createCanvas, loadImage } from "canvas"

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

const isImage = true
const latitude = "12.2741076"
const longitude = "109.2006335"
const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation_probability,rain,pressure_msl,cloud_cover,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=GMT&forecast_days=1`

export async function sheduleWeatherAction(action: (weatherText: string | Blob) => void) {
  const date = new Date()
  const hours = date.getUTCHours()
  const localHours = hours + 7

  if (localHours === 8 || localHours === 13 || localHours === 18) {
    const weatherText = await getWeather(hours)
    action(weatherText)
  }

  setTimeout(() => {
    sheduleWeatherAction(action)
  }, 30000)
}

export async function getWeather(hour: number) {
  const result = await queryWeather()

  if (result) {
    const weather = parseWeather(result, hour)
    if (isImage) {
      return await toImage(weather)
    } else {
      return toText(weather)
    }
  }

  return ""
}

async function toImage(weather: WeatherData) {
  const initialImage = await loadImage(path.join(import.meta.dirname, "image.jpg"))
  const canvas = createCanvas(400, 400)

  let ctx = canvas.getContext("2d")
  ctx.drawImage(initialImage, 0, 0)

  ctx = title(ctx, 50, "Погода на ближайший час")
  ctx = str(ctx, 100, "Температура", `${weather.temperature} °C`)
  ctx = str(ctx, 130, "Ощущается как", `${weather.apparentTemperature} °C`)
  ctx = str(ctx, 250, "Давление", `${weather.pressure} hPa`)
  ctx = str(ctx, 370, "Облачность", `${weather.cloud} %`)
  ctx = str(ctx, 280, "Ветер", `${weather.windSpeed} км/ч`)
  ctx = str(ctx, 160, "Влажность", `${weather.humidity} %`)
  ctx = str(ctx, 220, "Дождь", `${weather.rain} мм`)
  ctx = str(ctx, 190, "Вероятность дождя", `${weather.precipitation} %`)
  ctx = str(ctx, 340, "Порывы ветра", `${weather.windGusts} км/ч`)
  ctx = str(ctx, 310, "Направление ветра", `${weather.windDirection} °`)

  const image = new Blob([canvas.toBuffer("image/png")])
  console.log(image)
  return image
}

function title(ctx: CanvasRenderingContext2D, y: number, str: string) {
  return text(ctx, 40, y, "#fff", str, 26)
}

function str(ctx: CanvasRenderingContext2D, y: number, title: string, str: string) {
  text(ctx, 50, y, "#aaa", `${title}`, 20)
  return text(ctx, 255, y, "#fff", str, 20)
}

function text(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, value: string, size: number) {
  ctx.fillStyle = color
  ctx.font = `${size}px tahoma`
  ctx.fillText(value, x, y)
  return ctx
}

function toText(weather: WeatherData) {
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

async function queryWeather(): Promise<ResponceWeather | null> {
  try {
    const result = await axios.get(url)
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

function parseWeather(weather: ResponceWeather, hour: number): WeatherData {
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
