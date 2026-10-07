import board from './board.json' with { type: 'json' }
import { sql, type Connection, type Query, type SyncQuery } from './client.js'

function statements() {
  return [
    sql`INSERT INTO boards (id, title) VALUES (${board.id}, ${board.title})`,
    ...board.columns.flatMap((column, index) => [
      sql`INSERT INTO columns (id, board_id, title, position) VALUES (${column.id}, ${board.id}, ${column.title}, ${index})`,
      ...column.cards.map((card, cardIndex) => sql`INSERT INTO cards (id, column_id, title, description, position)
        VALUES (${card.id}, ${column.id}, ${card.title}, ${'description' in card ? card.description : null}, ${cardIndex})`),
    ]),
  ]
}

export async function seed(db: Connection, reset = false): Promise<void> {
  if (db.kind === 'sqlite') {
    db.transactionSync!((tx: SyncQuery) => {
      if (reset) tx.run(sql`DELETE FROM boards WHERE id = ${board.id}`)
      if (tx.all(sql`SELECT id FROM boards WHERE id = ${board.id}`).length) return
      for (const statement of statements()) tx.run(statement)
    })
  } else {
    await db.transaction(async (tx: Query) => {
      // Serialize concurrent migrate/seed processes and avoid reseeding an emptied board.
      await tx.run(sql`SELECT pg_advisory_xact_lock(6711092)`)
      if (reset) await tx.run(sql`DELETE FROM boards WHERE id = ${board.id}`)
      if ((await tx.all(sql`SELECT id FROM boards WHERE id = ${board.id}`)).length) return
      for (const statement of statements()) await tx.run(statement)
    })
  }
}
