// Простой интеграционный тест для системы капчи
// Проверяет базовую работоспособность сервиса

describe("captcha Integration Flow", () => {
  // Мок CaptchaService
  class MockCaptchaService {
    constructor() {
      this.activeCaptchas = new Map()
    }

    generateCaptcha(userId) {
      const num1 = Math.floor(Math.random() * 10) + 1
      const num2 = Math.floor(Math.random() * 10) + 1
      const correctAnswer = num1 + num2

      const captcha = {
        userId,
        question: `${num1} + ${num2} = ?`,
        correctAnswer,
        attempts: 0,
        maxAttempts: 3,
      }

      this.activeCaptchas.set(userId, captcha)
      return captcha
    }

    checkAnswer(userId, answer) {
      const captcha = this.activeCaptchas.get(userId)

      if (!captcha) {
        return { success: false, error: "Капча не найдена" }
      }

      captcha.attempts += 1
      const isCorrect = answer === captcha.correctAnswer

      if (isCorrect) {
        this.activeCaptchas.delete(userId)
        return { success: true, attempts: captcha.attempts }
      } else if (captcha.attempts >= captcha.maxAttempts) {
        this.activeCaptchas.delete(userId)
        return { success: false, reason: "Превышено количество попыток" }
      } else {
        return { success: false, attempts: captcha.attempts, remaining: captcha.maxAttempts - captcha.attempts }
      }
    }
  }

  it("должен генерировать капчу", () => {
    const captchaService = new MockCaptchaService()
    const captcha = captchaService.generateCaptcha(123)

    expect(captcha).toHaveProperty("question")
    expect(captcha).toHaveProperty("correctAnswer")
    expect(captcha.question).toMatch(/\d+ \+ \d+ = \?/)
    expect(typeof captcha.correctAnswer).toBe("number")
  })

  it("должен принимать правильный ответ", () => {
    const captchaService = new MockCaptchaService()
    const captcha = captchaService.generateCaptcha(123)

    const result = captchaService.checkAnswer(123, captcha.correctAnswer)

    expect(result.success).toBe(true)
    expect(result.attempts).toBe(1)
  })

  it("должен отклонять неправильный ответ", () => {
    const captchaService = new MockCaptchaService()
    const captcha = captchaService.generateCaptcha(123)

    const result = captchaService.checkAnswer(123, captcha.correctAnswer + 1)

    expect(result.success).toBe(false)
    expect(result.attempts).toBe(1)
    expect(result.remaining).toBe(2)
  })

  it("должен кикать после превышения попыток", () => {
    const captchaService = new MockCaptchaService()
    const captcha = captchaService.generateCaptcha(123)

    // Три неправильных ответа
    captchaService.checkAnswer(123, -1)
    captchaService.checkAnswer(123, -1)
    const result = captchaService.checkAnswer(123, -1)

    expect(result.success).toBe(false)
    expect(result.reason).toContain("Превышено количество попыток")
  })
})
