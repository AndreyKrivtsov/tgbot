export interface IAIProvider {
  generateContent: (
    apiKey: string,
    prompt: string,
    conversationHistory?: any[],
    systemPrompt?: string,
    customConfig?: object,
    tools?: any[]
  ) => Promise<string>
}
