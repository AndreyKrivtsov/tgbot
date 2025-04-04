"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.awaitSleep = awaitSleep;
function awaitSleep() {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true);
        }, 50);
    });
}
