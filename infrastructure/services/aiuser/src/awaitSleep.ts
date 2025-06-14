export function awaitSleep() {
    return new Promise(resolve => {
        setTimeout(() => {
            resolve(true)
        }, 50)
    })
}