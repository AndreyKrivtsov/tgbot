"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.clientConnect = clientConnect;
const telegram_1 = require("telegram");
const input_1 = __importDefault(require("input"));
const config_1 = require("./config");
const sessionStore_1 = require("./sessionStore");
const sessions_1 = require("telegram/sessions");
const apiPhone = config_1.config.apiPhone;
const apiPassword = config_1.config.apiPassword;
const apiId = config_1.config.apiId;
const apiHash = config_1.config.apiHash;
const session = new sessionStore_1.SessionStore();
async function clientConnect() {
    const sessionString = await session.get();
    console.log(sessionString);
    const clientOptions = {
        deviceModel: 'Ultron device',
        systemVersion: "Ultron device version 1",
        appVersion: "0.0.1",
        langCode: 'en',
        systemLangCode: 'en',
        // useWSS: true, 
        testServers: false,
        connectionRetries: 5
    };
    const client = new telegram_1.TelegramClient(new sessions_1.StringSession(sessionString), apiId, apiHash, clientOptions);
    await client.start({
        phoneNumber: apiPhone,
        password: async () => apiPassword,
        phoneCode: async () => await input_1.default.text("Please enter the code you received: "),
        onError: (err) => console.log(err),
    });
    if (!sessionString) {
        const sessionSaved = client.session.save();
        session.set(sessionSaved);
    }
    console.log(`[${new Date().toLocaleTimeString}] Client connected`);
    return client;
}
