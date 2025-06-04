import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema.js"
import type { Logger } from "../helpers/Logger.js"

export class Database {
  private client: postgres.Sql
  public db: ReturnType<typeof drizzle<typeof schema>>

  constructor(connectionString: string, logger: Logger) {
    this.client = postgres(connectionString, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    })

    this.db = drizzle(this.client, { schema })
    
    logger.i("Database connection established")
  }

  async close(): Promise<void> {
    await this.client.end()
  }

  // Proxy methods to db for easier usage
  select = this.db.select.bind(this.db)
  insert = this.db.insert.bind(this.db)
  update = this.db.update.bind(this.db)
  delete = this.db.delete.bind(this.db)
  transaction = this.db.transaction.bind(this.db)
}

export type Database = InstanceType<typeof Database> 