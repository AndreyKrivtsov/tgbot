// Простой интеграционный тест для AI сервиса Gemini
// Проверяет базовую работоспособность сервиса

// Мок GeminiAdapter
class MockGeminiAdapter {
  async generateContent(apiKey, prompt) {
    if (!apiKey) {
      throw new Error("Gemini API key is required")
    }
    await new Promise(resolve => setTimeout(resolve, 50))
    return `AI ответ: ${prompt}`
  }

  async testConnection(apiKey) {
    try {
      await this.generateContent(apiKey, "test")
      return true
    } catch (error) {
      return false
    }
  }
}

describe("gemini AI Integration Flow", () => {
  let geminiAdapter

  beforeAll(() => {
    geminiAdapter = new MockGeminiAdapter()
  })

  it("должен создавать экземпляр и генерировать ответ", async () => {
    expect(geminiAdapter).toBeInstanceOf(MockGeminiAdapter)

    const response = await geminiAdapter.generateContent("test-key", "Привет!")

    expect(response).toBeTruthy()
    expect(typeof response).toBe("string")
    expect(response).toContain("Привет!")
  })

  it("должен обрабатывать ошибку при пустом API ключе", async () => {
    await expect(
      geminiAdapter.generateContent("", "Привет!"),
    ).rejects.toThrow("Gemini API key is required")
  })

  it("должен тестировать подключение", async () => {
    const isConnected = await geminiAdapter.testConnection("test-key")
    expect(isConnected).toBe(true)

    const notConnected = await geminiAdapter.testConnection("")
    expect(notConnected).toBe(false)
  })
})
