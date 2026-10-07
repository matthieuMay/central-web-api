import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import Database from 'better-sqlite3'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import { sql, type SQL } from 'drizzle-orm'
import postgres from 'postgres'
import * as sqliteSchema from './schema.js'
import * as pgSchema from './schema.postgres.js'

export type Query = {
  all<T>(statement: SQL): Promise<T[]>
  run(statement: SQL): Promise<void>
}

export type SyncQuery = {
  all<T>(statement: SQL): T[]
  run(statement: SQL): void
}

export type Connection = Query & {
  kind: 'sqlite' | 'postgres'
  sqlite?: ReturnType<typeof drizzleSqlite<typeof sqliteSchema>>
  postgres?: ReturnType<typeof drizzlePostgres<typeof pgSchema>>
  transaction<T>(work: (query: Query) => Promise<T>): Promise<T>
  transactionSync?<T>(work: (query: SyncQuery) => T): T
  close(): Promise<void>
}

export function createDb(driver = process.env.DB_DRIVER ?? 'postgres'): Connection {
  if (driver === 'postgres') {
    const url = process.env.DATABASE_URL ?? 'postgres://trello:trello@localhost:5432/trello'
    const client = postgres(url)
    const db = drizzlePostgres(client, { schema: pgSchema })
    return {
      kind: 'postgres', postgres: db,
      all: async <T>(statement: SQL) => db.execute(statement) as unknown as T[],
      run: async (statement: SQL) => { await db.execute(statement) },
      transaction: (work) => db.transaction(async (tx) => work({
        all: async <T>(statement: SQL) => tx.execute(statement) as unknown as T[],
        run: async (statement: SQL) => { await tx.execute(statement) },
      })),
      close: async () => { await client.end() },
    }
  }
  if (driver !== 'sqlite') throw new Error(`Unsupported DB_DRIVER: ${driver}`)
  const path = process.env.SQLITE_PATH ?? './data/trello.sqlite'
  mkdirSync(dirname(path), { recursive: true })
  const connection = new Database(path)
  connection.pragma('foreign_keys = ON')
  const db = drizzleSqlite(connection, { schema: sqliteSchema })
  const query: Query = {
    all: async <T>(statement: SQL) => db.all(statement) as T[],
    run: async (statement: SQL) => { db.run(statement) },
  }
  const syncQuery: SyncQuery = {
    all: <T>(statement: SQL) => db.all(statement) as T[],
    run: (statement: SQL) => { db.run(statement) },
  }
  return {
    kind: 'sqlite', sqlite: db, ...query,
    transaction: async () => { throw new Error('Use transactionSync for SQLite') },
    transactionSync: (work) => connection.transaction(() => work(syncQuery)).immediate(),
    close: async () => { connection.close() },
  }
}

export { sql }
