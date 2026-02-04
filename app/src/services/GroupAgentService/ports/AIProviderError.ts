export class AIProviderError extends Error {
  readonly statusCode?: number
  readonly providerStatus?: string

  constructor(message: string, params?: { statusCode?: number, providerStatus?: string }) {
    super(message)
    this.name = "AIProviderError"
    this.statusCode = params?.statusCode
    this.providerStatus = params?.providerStatus
  }
}

export function isRateLimitError(error: unknown): boolean {
  if (!(error instanceof AIProviderError)) {
    return false
  }
  return error.statusCode === 429 || error.providerStatus === "RESOURCE_EXHAUSTED"
}
