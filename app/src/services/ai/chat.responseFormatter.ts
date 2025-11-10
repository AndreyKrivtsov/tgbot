export function formatResponse(response: string): string {
  return response || ""
}

export function validateResponse(response: string): { isValid: boolean, reason?: string } {
  if (!response || typeof response !== "string")
    return { isValid: false, reason: "empty" }
  return { isValid: true }
}
