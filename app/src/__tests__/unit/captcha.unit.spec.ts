import { CaptchaService } from "../../services/CaptchaService/index.js"
import { makeActions, makeConfig, makeLogger } from "../test-utils/mocks.js"

describe("captchaService (unit)", () => {
  it("startChallenge: дедупликация 2 секунды", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const fixedNow = 1_000_000
    const service = new CaptchaService(makeConfig(), logger, {
      actions,
      now: () => fixedNow,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 1, userId: 10, username: "u", firstName: "F" })
    await service.startChallenge({ chatId: 1, userId: 10, username: "u", firstName: "F" })

    expect((actions as any).sendCaptchaMessage).toHaveBeenCalledTimes(1)
    expect((actions as any).restrictUser).toHaveBeenCalledTimes(1)
    expect(service.isUserRestricted(10)).toBe(true)
  })

  it("submitAnswer: корректный ответ снимает ограничения и удаляет сообщение", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const now = 1_000_500
    const service = new CaptchaService(makeConfig(), logger, {
      actions,
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 1, userId: 11, username: "u2", firstName: "F2" })

    await service.submitAnswer({ userId: 11, isCorrect: true })

    expect((actions as any).unrestrictUser).toHaveBeenCalledWith(1, 11)
    expect((actions as any).deleteMessage).toHaveBeenCalledTimes(1)
    expect((actions as any).sendResultMessage).toHaveBeenCalledTimes(1)
    expect(service.isUserRestricted(11)).toBe(false)
  })

  it("submitAnswer: неверный ответ — удаление вопроса и kick", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const now = 1_001_000
    const service = new CaptchaService(makeConfig(), logger, {
      actions,
      now: () => now,
      policy: { duplicateWindowMs: 2000, autoUnbanDelayMs: 5000 },
    })

    await service.startChallenge({ chatId: 10, userId: 21, username: "bad", firstName: "Bad" })

    await service.submitAnswer({ userId: 21, isCorrect: false })

    expect((actions as any).deleteMessage).toHaveBeenCalledTimes(1)
    expect((actions as any).kickUser).toHaveBeenCalledWith(10, 21, "Bad", 5000)
    expect(service.isUserRestricted(21)).toBe(false)
  })

  it("submitAnswer: проверка по questionId и answer", async () => {
    const actions = makeActions()
    const logger = makeLogger()
    const now = 1_002_000
    const service = new CaptchaService(makeConfig(), logger, {
      actions,
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 33, userId: 55, username: "mix", firstName: "Mix" })

    const restricted = service.getRestrictedUser(55)!
    // неправильный answer
    await service.submitAnswer({ userId: 55, questionId: restricted.questionId, answer: restricted.answer + 1 })
    expect((actions as any).kickUser).toHaveBeenCalled()

    // повторная попытка с корректным answer — пользователя уже нет в сторе
    await service.submitAnswer({ userId: 55, questionId: restricted.questionId, answer: restricted.answer })
    // никаких дополнительных вызовов
    expect((actions as any).unrestrictUser).not.toHaveBeenCalled()
  })

  it("startChallenge: дедуп пограничные случаи (1999мс — игнор, 2000мс — запуск)", async () => {
    const actions = makeActions()
    const logger = makeLogger()

    let now = 1_003_000
    const service = new CaptchaService(makeConfig(), logger, {
      actions,
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

    expect((actions as any).sendCaptchaMessage).toHaveBeenCalledTimes(2)
    expect((actions as any).restrictUser).toHaveBeenCalledTimes(2)
  })

  it("generateCaptcha: корректность опций и единственность правильного ответа", () => {
    const actions = makeActions()
    const logger = makeLogger()
    const service = new CaptchaService(makeConfig(), logger, { actions })

    const challenge = service.generateCaptcha()
    const { question, answer, options } = challenge

    expect(Array.isArray(question)).toBe(true)
    expect(typeof answer).toBe("number")
    expect(options.includes(answer)).toBe(true)
    const unique = new Set(options)
    expect(unique.size).toBe(options.length)
  })

  it("без actions: startChallenge сохраняет состояние, submitAnswer очищает без вызовов", async () => {
    const logger = makeLogger()
    const now = 1_010_000
    const service = new CaptchaService(makeConfig(), logger, {
      now: () => now,
      policy: { duplicateWindowMs: 2000 },
    })

    await service.startChallenge({ chatId: 5, userId: 51, username: "u51", firstName: "U51" })
    expect(service.isUserRestricted(51)).toBe(true)

    // Нет actions — просто удаляется из стора
    await service.submitAnswer({ userId: 51, isCorrect: true })
    expect(service.isUserRestricted(51)).toBe(false)
  })

  it("таймаут: по истечении timeoutMs вызывается deleteMessage и restrictUser", async () => {
    const actions = makeActions()
    const logger = makeLogger()

    let now = 1_020_000
    let scheduledCallback: (() => void) | undefined
    const setTimeoutFn = (fn: () => void) => {
      scheduledCallback = fn
      return 0
    }

    const service = new CaptchaService(makeConfig(), logger, {
      actions,
      now: () => now,
      setTimeoutFn,
      policy: { duplicateWindowMs: 2000, temporaryBanDurationSec: 40 },
    }, { timeoutMs: 100, checkIntervalMs: 10 })

    await service.start() // включает мониторинг

    await service.startChallenge({ chatId: 9, userId: 99, username: "u99", firstName: "U99" })

    // Пролистываем время до истечения таймаута и триггерим проверку
    now += 150
    scheduledCallback?.()

    expect((actions as any).deleteMessage).toHaveBeenCalled()
    expect((actions as any).restrictUser).toHaveBeenCalledWith(9, 99, 40)
    expect(service.isUserRestricted(99)).toBe(false)
  })
})
