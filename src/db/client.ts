import Database from 'better-sqlite3'
import { drizzle as drizzleSqlite } from 'drizzle-orm/better-sqlite3'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema.js'

const driver = process.env.DB_DRIVER ?? 'sqlite'

export function createDb() {
  if (driver === 'postgres') {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL required when DB_DRIVER=postgres')
    const client = postgres(url)
    return drizzlePostgres(client, { schema })
  }

  const path = process.env.SQLITE_PATH ?? './data/trello.sqlite'
  const sqlite = new Database(path)
  return drizzleSqlite(sqlite, { schema })
}

export const db = createDb()
