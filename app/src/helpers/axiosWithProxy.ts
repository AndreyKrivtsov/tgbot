import axios from "axios"
import type { AxiosRequestConfig, AxiosResponse } from "axios"
import { HttpsProxyAgent } from "https-proxy-agent"
import { Logger } from "../helpers/Logger.js"
import { config } from "../config.js"

const l = new Logger("AxiosProxy")

function createProxyAgent(): HttpsProxyAgent<string> | null {
  if (!config.PROXY_ENABLED) {
    l.i("Proxy disabled")
    return null
  }

  if (!config.PROXY_URL) {
    l.w("Proxy enabled but PROXY_URL not configured")
    return null
  }

  let proxyUrl = config.PROXY_URL

  // Добавляем аутентификацию в URL если указаны логин/пароль
  if (config.PROXY_USERNAME && config.PROXY_PASSWORD) {
    // Извлекаем протокол и хост из URL
    const url = new URL(proxyUrl)
    proxyUrl = `${url.protocol}//${config.PROXY_USERNAME}:${config.PROXY_PASSWORD}@${url.host}`
    l.i("Using proxy with authentication:", url.host)
  } else {
    l.i("Using proxy without authentication:", proxyUrl)
  }

  return new HttpsProxyAgent(proxyUrl)
}

export async function axiosWithProxy<T = any>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
  try {
    const proxyAgent = createProxyAgent()

    if (proxyAgent) {
      return axios({
        ...config,
        httpAgent: proxyAgent,
        httpsAgent: proxyAgent,
        proxy: false, // Отключаем стандартную обработку proxy в axios
      })
    } else {
      l.i("Making request without proxy")
      return axios({
        ...config,
      })
    }
  } catch (error: any) {
    l.e("Axios request failed:", error.message)
    throw error
  }
}
