export const parseInitData = (initData) => {
  const params = new URLSearchParams(initData)
  const result = {}

  for (const [key, value] of params.entries()) {
    if (key === "user") {
      try {
        result.user = JSON.parse(decodeURIComponent(value))
      } catch {
        result.user = null
      }
      continue
    }

    result[key] = decodeURIComponent(value)
  }

  return result
}
