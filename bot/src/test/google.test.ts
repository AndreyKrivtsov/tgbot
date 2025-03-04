import { config } from "../config.js"
import { AI } from "../services/aiService/AI.js"

const ai = new AI(config.AI_API_KEY)
ai.initModel("gemini-2.0-flash", "")
const contextId = "sdfadsf"

const q1 = "Привет, меня зовут Семен"

const r1 = await ai.request(contextId, q1)

console.log("User:", q1)
console.log("Model:", r1)

const q2 = "Как меня зовут?"

const r2 = await ai.request(contextId, q2)

console.log("User:", q2)
console.log("Model:", r2)
