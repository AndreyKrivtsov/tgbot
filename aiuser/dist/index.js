"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const telegram_1 = require("telegram");
const awaitSleep_1 = require("./awaitSleep");
const clientConnect_1 = require("./clientConnect");
async function main() {
    const client = await (0, clientConnect_1.clientConnect)();
    await (0, awaitSleep_1.awaitSleep)();
    const me = client.getMe();
    console.log('me', me);
    await (0, awaitSleep_1.awaitSleep)();
    const unread = await client.invoke(new telegram_1.Api.messages.GetDialogUnreadMarks());
    console.log('unread');
}
main();
