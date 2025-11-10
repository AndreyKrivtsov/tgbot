export function isFunctionCall(response: string): boolean {
  try {
    const parsed = JSON.parse(response)
    return parsed.type === "function_call" && parsed.function_call && parsed.function_call.name
  } catch {
    return false
  }
}

export function parseFunctionCall(response: string): { name: string, args: any } {
  const parsed = JSON.parse(response)
  return { name: parsed.function_call.name, args: parsed.function_call.args || {} }
}


