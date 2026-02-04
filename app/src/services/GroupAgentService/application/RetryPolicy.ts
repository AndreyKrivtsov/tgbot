export interface RetryDecision {
  shouldRetry: boolean
  delayMs: number
}

export interface RetryPolicy {
  decide: (input: { attempt: number, error: unknown }) => RetryDecision
}

export class DefaultRetryPolicy implements RetryPolicy {
  private readonly maxAttempts: number
  private readonly delayMs: number

  constructor(params: { maxAttempts: number, delayMs: number }) {
    this.maxAttempts = params.maxAttempts
    this.delayMs = params.delayMs
  }

  decide(input: { attempt: number, error: unknown }): RetryDecision {
    if (input.attempt >= this.maxAttempts - 1) {
      return { shouldRetry: false, delayMs: 0 }
    }

    return {
      shouldRetry: true,
      delayMs: this.delayMs,
    }
  }
}
