import { Api } from "telegram";
import { awaitSleep } from "./awaitSleep";
import { clientConnect } from "./clientConnect";
import { processWatcher } from "./processWatcher";
import { UpdateConnectionState } from "telegram/network";

processWatcher()

async function main() {
    const client = await clientConnect()

    await awaitSleep()

    const me = await client.getMe()
    // console.log('me', me)

    await awaitSleep()

    const state = await client.invoke(new Api.updates.GetState())
    // console.log('state', state)

    await awaitSleep()

    client.addEventHandler((update: Api.TypeUpdate) => {
        const updateType = update.className
        
        if (updateType === 'UpdateUserTyping') {
            console.log('=== Typing...')
        } else if (updateType === undefined) {
            console.log('Undefined update', update instanceof UpdateConnectionState)
        } else {
            console.log('===', update)
        }
    })
}

main()