import path from "path"
import {fileURLToPath} from "url"
import {getLlama, LlamaChatResponseChunk, LlamaChatSession, LlamaModel, LlamaOptions, resolveModelFile} from "node-llama-cpp"

interface BotAiSessionData {
    id: string
    session: LlamaChatSession
    count: number
}

interface BotAiSessionsList {
    [key: string]: BotAiSessionData
}

interface BotPromptParams {
    newSession: boolean
    maxTokens: number
    temperature: number
    minP: number
    topK: number
    topP: number
    seed: number
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const modelsDirectory = path.join(__dirname, "..", "models")

const USE_CPU = false

export class BotAi {
    model: LlamaModel | null
    sessions: BotAiSessionsList = {}

    constructor() {
        this.model = null
    }

    async init() {
        console.info('LLama init...')
        const params: LlamaOptions | undefined = USE_CPU ? { gpu: false } : undefined
        const llama = await getLlama(params)
        const modelPath = await resolveModelFile(
            "hf:bartowski/gemma-2-2b-it-abliterated-GGUF:Q6_K_L",
            modelsDirectory
        )
        console.info('LLama load model...')
        this.model = await llama.loadModel({modelPath})
        console.info('LLama inited successfull')
    }

    async prompt(sessionId: string, text: string, params: BotPromptParams) {
        if (!sessionId) {
            return
        }

        const { newSession, maxTokens, temperature, minP, topK, topP, seed } = params

        let session = this.getSessionWithCount(sessionId)

        if (!session) {
            session = await this.createSession(sessionId)
        } else if (newSession) {
            this.deleteSession(session.id)
            session = await this.createSession(sessionId)
        }

        if (session) {
            return await session.session.prompt(text, params)
        } else {
            console.error('No session')
            return ''
        }
    }

    async promptOnline(sessionId: string, text: string, onType: (char: LlamaChatResponseChunk) => void) {
        const session = this.getSessionWithCount(sessionId)
        if (session) {
            return await session.session.prompt(text, {
                onResponseChunk(chunk: LlamaChatResponseChunk) {
                    onType(chunk)
                }
            })
        } else {
            console.error('Session is not ...')
            return ''
        }
    }

    getSessionInfo(sessionId: string) {
        return this.sessions[sessionId]
    }

    getSessionWithCount(sessionId: string) {
        const session = this.sessions[sessionId]
        session?.count && session.count++
        return session
    }

    async createSession(sessionId: string) {
        if (this.model) {
            const context = await this.model.createContext()
            const session = new LlamaChatSession({
                contextSequence: context.getSequence()
            })

            const newSession = {
                id: sessionId,
                session,
                count: 0
            }

            this.sessions[sessionId] = newSession
            return newSession
        }

        return
    }

    async deleteSession(sessionId: string) {
        const session = this.sessions[sessionId]
        if (session) {
            session.session.dispose()
        }
        delete this.sessions[sessionId]
    }

    contextsLength() {
        return this.sessions.length
    }
}
