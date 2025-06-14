import Koa from 'koa'
import bodyParser from "@koa/bodyparser"
import Router from '@koa/router'
import { BotAi } from './BotAI.js'

const app = new Koa()
const router = new Router()

app.use(bodyParser())
app.use(router.routes())
app.use(router.allowedMethods())

const botAi = new BotAi()
await botAi.init()

router.post('/', async (ctx, next) => {
    const request = ctx.request.body

    if (request && request.contextId && request.message) {
        const sessionId = request.contextId
        const session = botAi.getSessionInfo(sessionId)

        if (session) {
            if (session.count > 50) {
                await botAi.deleteSession(sessionId)
            }
        }

        const answer = await botAi.prompt(sessionId, request.message, request.params)

        ctx.body = {
            error: false,
            message: answer
        }
    } else {
        ctx.body = {
            error: true,
            message: 'Empty body'
        }
    }
})

app.listen(3443)
