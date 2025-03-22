import { TelegramClient } from "telegram";
import input from "input";
import { config } from "./config";
import { SessionStore } from "./sessionStore";
import { StringSession } from "telegram/sessions";
import { TelegramClientParams } from "telegram/client/telegramBaseClient";

const apiPhone = config.apiPhone
const apiPassword = config.apiPassword
const apiId = config.apiId;
const apiHash = config.apiHash;
const session = new SessionStore()

export async function clientConnect() {
    const sessionString = await session.get()

    console.log(sessionString)

    const clientOptions: TelegramClientParams = {
        deviceModel: 'Ultron device',
        systemVersion: "Ultron device version 1",
        appVersion: "0.0.1",
        langCode: 'en',
        systemLangCode: 'en',
        // useWSS: true, 
        testServers: false,
        connectionRetries: 5
    }

    const client = new TelegramClient(new StringSession(sessionString), apiId, apiHash, clientOptions);

    await client.start({
        phoneNumber: apiPhone,
        password: async () => apiPassword,
        phoneCode: async () => await input.text("Please enter the code you received: "),
        onError: (err) => console.log(err),
    });

    if (!sessionString) {
        const sessionSaved = client.session.save() as unknown as string
        session.set(sessionSaved)
    }

    console.log(`[${new Date().toLocaleTimeString}] Client connected`);
    
    return client
}