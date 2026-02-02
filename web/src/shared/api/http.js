const BASE_URL = "http://localhost:3000"

export const requestJson = async (url, options = {}) => {
  console.log("API request:", url, options)

  const response = await fetch(`${BASE_URL}${url}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  })

  let data = {}

  // console.log("API response:", response)

  try {
    data = await response.json()

    console.log("API data:", data)
  } catch (error) {
    console.log("API error:", error)
  }

  if (!response.ok || data.success === false) {
    const errorMessage = data.error || `Ошибка ${response.status}`
    throw new Error(errorMessage)
  }

  return data
}
