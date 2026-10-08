import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import { migrate as migrateSqlite } from 'drizzle-orm/better-sqlite3/migrator'
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator'
import { createDb, sql, type Connection } from './client.js'
import { seed } from './seed.js'
import { timestampComments, type CommentInput, type CommentData } from './store.js'

export async function prepare(db: Connection): Promise<void> {
  const folder = (dialect: string) => fileURLToPath(new URL(`../../drizzle/${dialect}/`, import.meta.url))
  if (db.sqlite) migrateSqlite(db.sqlite, { migrationsFolder: folder('sqlite') })
  else if (db.postgres) await migratePostgres(db.postgres, { migrationsFolder: folder('postgres') })
  // Cards saved before comments gained timestamps need stable values on the first restart.
  const cards = await db.all<{ id: string; comments: string }>(sql`SELECT id, comments FROM cards WHERE comments <> ${'[]'}`)
  for (const card of cards) {
    const comments = JSON.parse(card.comments) as CommentInput[]
    if (comments.every((comment) => comment.createdAt !== undefined)) continue
    const previous = comments.filter((comment): comment is CommentData => comment.createdAt !== undefined)
    const updated = timestampComments(comments, previous)
    await db.run(sql`UPDATE cards SET comments = ${JSON.stringify(updated)} WHERE id = ${card.id}`)
  }
  await seed(db)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fileURLToPath(new URL(`file://${process.argv[1]}`))) {
  const db = createDb()
  try { await prepare(db); console.log('Database migrated and seeded if empty') }
  finally { await db.close() }
}
