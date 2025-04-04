const env = process.env

export const config = {
    appName: 'Ultron',

    apiPhone: env.API_PHONE,
    apiPassword: env.API_PASSWORD,
    apiId: Number(env.API_ID),
    apiHash: env.API_HASH,
    apiSession: env.API_SESSION
}
