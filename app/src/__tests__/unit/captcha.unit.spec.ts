import { CaptchaService } from "../../services/CaptchaService/index.js"
import { makeConfig, makeEventBus, makeLogger } from "../test-utils/mocks.js"

describe("captchaService (unit)", () => {
  it("startChallenge: дедупликация 2 секунды", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const fixedNow = 1_000_000
    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => fixedNow,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 1, userId: 10, username: "u", firstName: "F" })
    await service.startChallenge({ chatId: 1, userId: 10, username: "u", firstName: "F" })

    // Проверяем, что событие captcha.challenge было эмитировано только 1 раз
    expect((eventBus as any).emit).toHaveBeenCalledWith("captcha.challenge", expect.objectContaining({
      userId: 10,
      chatId: 1,
    }))
    expect((eventBus as any).emit).toHaveBeenCalledTimes(1)
    expect(service.isUserRestricted(10)).toBe(true)
  })

  it("submitAnswer: корректный ответ снимает ограничения и удаляет сообщение", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const now = 1_000_500
    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 1, userId: 11, username: "u2", firstName: "F2" })

    await service.submitAnswer({ userId: 11, isCorrect: true })

    // Проверяем, что эмитировано событие CAPTCHA_PASSED с actions
    expect((eventBus as any).emitCaptchaPassed).toHaveBeenCalledWith(expect.objectContaining({
      userId: 11,
      chatId: 1,
      actions: expect.arrayContaining([
        expect.objectContaining({ type: "unrestrict" }),
        expect.objectContaining({ type: "deleteMessage" }),
      ]),
    }))
    expect(service.isUserRestricted(11)).toBe(false)
  })

  it("submitAnswer: неверный ответ — удаление вопроса и kick", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const now = 1_001_000
    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => now,
      policy: { duplicateWindowMs: 2000, autoUnbanDelayMs: 5000 },
    })

    await service.startChallenge({ chatId: 10, userId: 21, username: "bad", firstName: "Bad" })

    await service.submitAnswer({ userId: 21, isCorrect: false })

    // Проверяем, что эмитировано событие CAPTCHA_FAILED с actions
    expect((eventBus as any).emitCaptchaFailed).toHaveBeenCalledWith(expect.objectContaining({
      userId: 21,
      chatId: 10,
      actions: expect.arrayContaining([
        expect.objectContaining({ type: "deleteMessage" }),
        expect.objectContaining({ type: "ban" }),
      ]),
    }))
    expect(service.isUserRestricted(21)).toBe(false)
  })

  it("submitAnswer: проверка по questionId и answer", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const now = 1_002_000
    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 33, userId: 55, username: "mix", firstName: "Mix" })

    const restricted = service.getRestrictedUser(55)!
    // неправильный answer
    await service.submitAnswer({ userId: 55, questionId: restricted.questionId, answer: restricted.answer + 1 })
    expect((eventBus as any).emitCaptchaFailed).toHaveBeenCalled()

    // Сброс mock для следующей проверки
    ;(eventBus as any).emitCaptchaPassed.mockClear()
    ;(eventBus as any).emitCaptchaFailed.mockClear()

    // повторная попытка с корректным answer — пользователя уже нет в сторе, ничего не должно вызываться
    await service.submitAnswer({ userId: 55, questionId: restricted.questionId, answer: restricted.answer })
    expect((eventBus as any).emitCaptchaPassed).not.toHaveBeenCalled()
    expect((eventBus as any).emitCaptchaFailed).not.toHaveBeenCalled()
  })

  it("startChallenge: дедуп пограничные случаи (1999мс — игнор, 2000мс — запуск)", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()

    let now = 1_003_000
    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 7, userId: 70, username: "u70", firstName: "U70" })
    // +1999 мс — всё ещё в окне
    now += 1999
    await service.startChallenge({ chatId: 7, userId: 70, username: "u70", firstName: "U70" })
    // +1 мс — за окном
    now += 1
    await service.startChallenge({ chatId: 7, userId: 70, username: "u70", firstName: "U70" })

    // Проверяем, что событие captcha.challenge было эмитировано 2 раза
    expect((eventBus as any).emit).toHaveBeenCalledTimes(2)
  })

  it("generateCaptcha: корректность опций и единственность правильного ответа", () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { eventBus })

    const challenge = service.generateCaptcha()
    const { question, answer, options } = challenge

    expect(Array.isArray(question)).toBe(true)
    expect(typeof answer).toBe("number")
    expect(options.includes(answer)).toBe(true)
    const unique = new Set(options)
    expect(unique.size).toBe(options.length)
  })

  it("без eventBus: startChallenge сохраняет состояние, submitAnswer очищает без вызовов", async () => {
    const logger = makeLogger()
    const now = 1_010_000
    const service = new CaptchaService(makeConfig(), logger, {
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 5, userId: 51, username: "u51", firstName: "U51" })
    expect(service.isUserRestricted(51)).toBe(true)

    // Нет eventBus — просто удаляется из стора
    await service.submitAnswer({ userId: 51, isCorrect: true })
    expect(service.isUserRestricted(51)).toBe(false)
  })

  it("таймаут: по истечении timeoutMs эмитируется событие CAPTCHA_FAILED", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()

    let now = 1_020_000
    let scheduledCallback: (() => void) | undefined
    const setTimeoutFn = (fn: () => void) => {
      scheduledCallback = fn
      return 0
    }

    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => now,
      setTimeoutFn,
      policy: { duplicateWindowMs: 2000, temporaryBanDurationSec: 40 },
    }, { timeoutMs: 100, checkIntervalMs: 10 })

    await service.start() // включает мониторинг

    await service.startChallenge({ chatId: 9, userId: 99, username: "u99", firstName: "U99" })

    // Пролистываем время до истечения таймаута и триггерим проверку
    now += 150
    scheduledCallback?.()

    // Проверяем, что эмитировано событие CAPTCHA_FAILED с actions
    expect((eventBus as any).emitCaptchaFailed).toHaveBeenCalledWith(expect.objectContaining({
      userId: 99,
      chatId: 9,
      reason: "timeout",
      actions: expect.arrayContaining([
        expect.objectContaining({ type: "deleteMessage" }),
        expect.objectContaining({ type: "ban" }),
      ]),
    }))
    expect(service.isUserRestricted(99)).toBe(false)
  })

  it("обновление questionId после получения события CAPTCHA_MESSAGE_SENT", async () => {
    const eventBus = makeEventBus()
    const logger = makeLogger()
    const now = 1_030_000
    const service = new CaptchaService(makeConfig(), logger, {
      eventBus,
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.initialize()
    await service.startChallenge({ chatId: 15, userId: 150, username: "test", firstName: "Test" })

    // Проверяем, что questionId изначально 0
    let restricted = service.getRestrictedUser(150)!
    expect(restricted.questionId).toBe(0)

    // Получаем обработчик события CAPTCHA_MESSAGE_SENT из мока
    const captchaMessageSentHandler = (eventBus as any).onCaptchaMessageSent.mock.calls[0][0]

    // Эмулируем получение messageId от TelegramActionsAdapter
    await captchaMessageSentHandler({
      chatId: 15,
      userId: 150,
      messageId: 12345,
    })

    // Проверяем, что questionId обновлен
    restricted = service.getRestrictedUser(150)!
    expect(restricted.questionId).toBe(12345)

    // Проверяем, что при прохождении капчи используется правильный messageId
    await service.submitAnswer({ userId: 150, isCorrect: true })
    expect((eventBus as any).emitCaptchaPassed).toHaveBeenCalledWith(expect.objectContaining({
      userId: 150,
      chatId: 15,
      actions: expect.arrayContaining([
        expect.objectContaining({
          type: "deleteMessage",
          params: expect.objectContaining({
            messageId: 12345,
          }),
        }),
      ]),
    }))
  })
})
