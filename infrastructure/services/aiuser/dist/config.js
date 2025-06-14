"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const env = process.env;
exports.config = {
    appName: 'Ultron',
    apiPhone: env.API_PHONE,
    apiPassword: env.API_PASSWORD,
    apiId: Number(env.API_ID),
    apiHash: env.API_HASH,
    apiSession: env.API_SESSION
};
