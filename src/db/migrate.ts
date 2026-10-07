import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import { createDb, type Connection } from './client.js'
import { seed } from './seed.js'

export async function prepare(db: Connection): Promise<void> {
  const folder = (dialect: string) => fileURLToPath(new URL(`../../drizzle/${dialect}/`, import.meta.url))
  if (db.sqlite) migrateSqlite(db.sqlite, { migrationsFolder: folder('sqlite') })
  else if (db.postgres) await migratePostgres(db.postgres, { migrationsFolder: folder('postgres') })
  await seed(db)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const db = createDb()
  try { await prepare(db); console.log('Database migrated and seeded if empty') }
  finally { await db.close() }
}
