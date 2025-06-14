interface Args {
  onStop?: () => void
  onException?: (e: Error | unknown) => void
}

export function processWatcher(args?: Args) {
  const signals = ["SIGINT", "SIGTERM"]

  for (const signal of signals) {
    process.on(signal, async () => {
      if (args && args.onStop) {
        args.onStop()
      }
      console.log(`Received ${signal}. Initiating graceful shutdown...`)
      process.exit(0)
    })
  }
  
  process.on("uncaughtException", (error) => {
    if (args && args.onException) {
      args.onException(error)
    }
    console.error("uncaughtException:", error)
  })
  
  process.on("unhandledRejection", (error) => {
    if (args && args.onException) {
      args.onException(error)
    }
    console.error("unhandledRejection:", error)
  })
}

