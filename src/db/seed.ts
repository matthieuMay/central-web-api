import { randomInt } from 'node:crypto'
import { v7 } from 'uuid'
import board from './board.json' with { type: 'json' }
import { sql, type Connection, type Query, type SyncQuery } from './client.js'

const firstnames = ['Alex', 'Amira', 'Camille', 'Daniel', 'Elena', 'Fatima', 'Hugo', 'Iris', 'Jules', 'Lina', 'Maya', 'Noah', 'Oscar', 'Rania', 'Sofia']
const lastnames = ['Bernard', 'Chen', 'Diallo', 'Dubois', 'Garcia', 'Haddad', 'Kim', 'Laurent', 'Martin', 'Moreau', 'Nguyen', 'Patel', 'Rossi', 'Santos', 'Wilson']

function boardStatements() {
  return [
    sql`INSERT INTO boards (id, title) VALUES (${board.id}, ${board.title})`,
    ...board.columns.flatMap((column, index) => [
      sql`INSERT INTO columns (id, board_id, title, position) VALUES (${column.id}, ${board.id}, ${column.title}, ${index})`,
      ...column.cards.map((card, cardIndex) => sql`INSERT INTO cards (id, column_id, title, description, position)
        VALUES (${card.id}, ${column.id}, ${card.title}, ${'description' in card ? card.description : null}, ${cardIndex})`),
    ]),
  ]
}

function userStatements() {
  const available = [...firstnames]
  return Array.from({ length: 10 }, () => {
    const firstname = available.splice(randomInt(available.length), 1)[0]
    const lastname = lastnames[randomInt(lastnames.length)]
    return sql`INSERT INTO users (id, firstname, lastname) VALUES (${v7()}, ${firstname}, ${lastname})`
  })
}

export async function seed(db: Connection, reset = false): Promise<void> {
  if (db.kind === 'sqlite') {
    db.transactionSync!((tx: SyncQuery) => {
      if (reset) tx.run(sql`DELETE FROM boards WHERE id = ${board.id}`)
      if (reset) tx.run(sql`DELETE FROM users`)
      if (!tx.all(sql`SELECT id FROM boards WHERE id = ${board.id}`).length)
        for (const statement of boardStatements()) tx.run(statement)
      if (!tx.all(sql`SELECT id FROM users LIMIT 1`).length)
        for (const statement of userStatements()) tx.run(statement)
    })
  } else {
    await db.transaction(async (tx: Query) => {
      // Serialize concurrent migrate/seed processes.
      await tx.run(sql`SELECT pg_advisory_xact_lock(6711092)`)
      if (reset) await tx.run(sql`DELETE FROM boards WHERE id = ${board.id}`)
      if (reset) await tx.run(sql`DELETE FROM users`)
      if (!(await tx.all(sql`SELECT id FROM boards WHERE id = ${board.id}`)).length)
        for (const statement of boardStatements()) await tx.run(statement)
      if (!(await tx.all(sql`SELECT id FROM users LIMIT 1`)).length)
        for (const statement of userStatements()) await tx.run(statement)
    })
  }
}
