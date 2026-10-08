import { sql, type Connection, type Query } from './client.js'

export type CardData = { id: string; title: string; description?: string }
export type ColumnData = { id: string; title: string; cards: CardData[] }
export type BoardData = { id: string; title: string; columns: ColumnData[] }
export type UserData = { id: string; firstname: string; lastname: string }

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message) }
}

type BoardRow = {
  board_id: string; board_title: string; column_id: string | null
  column_title: string | null; card_id: string | null
  card_title: string | null; description: string | null
}
type CardRow = { id: string; title: string; description: string | null; column_id: string }
type ColumnRow = { id: string; board_id: string }
type OrderRow = { id: string }

function cardData(row: CardRow): CardData {
  return { id: row.id, title: row.title, ...(row.description === null ? {} : { description: row.description }) }
}

export class Store {
  constructor(readonly db: Connection) {}

  async users(): Promise<UserData[]> {
    return this.db.all<UserData>(sql`SELECT id, firstname, lastname FROM users ORDER BY firstname, lastname, id`)
  }

  async board(id: string): Promise<BoardData | null> {
    const rows = await this.db.all<BoardRow>(sql`
      SELECT b.id AS board_id, b.title AS board_title,
        c.id AS column_id, c.title AS column_title,
        a.id AS card_id, a.title AS card_title, a.description
      FROM boards b
      LEFT JOIN columns c ON c.board_id = b.id
      LEFT JOIN cards a ON a.column_id = c.id
      WHERE b.id = ${id}
      ORDER BY c.position, c.id, a.position, a.id`)
    if (!rows.length) return null
    const board: BoardData = { id: rows[0].board_id, title: rows[0].board_title, columns: [] }
    for (const row of rows) {
      if (row.column_id === null) continue
      let column = board.columns[board.columns.length - 1]
      if (column?.id !== row.column_id) {
        column = { id: row.column_id, title: row.column_title!, cards: [] }
        board.columns.push(column)
      }
      if (row.card_id !== null) column.cards.push({
        id: row.card_id, title: row.card_title!, ...(row.description === null ? {} : { description: row.description }),
      })
    }
    return board
  }

  async create(columnId: string, data: CardData): Promise<CardData> {
    const create = async (tx: Query) => {
      const column = (await tx.all<ColumnRow>(sql`SELECT id, board_id FROM columns WHERE id = ${columnId}`))[0]
      if (!column) throw new ApiError(404, 'Column not found')
      if (this.db.kind === 'postgres') await tx.run(sql`SELECT id FROM boards WHERE id = ${column.board_id} FOR UPDATE`)
      if ((await tx.all(sql`SELECT id FROM cards WHERE id = ${data.id}`)).length) throw new ApiError(409, 'Card ID already exists')
      const [{ next_position }] = await tx.all<{ next_position: number }>(sql`
        SELECT COALESCE(MAX(position) + 1, 0) AS next_position FROM cards WHERE column_id = ${columnId}`)
      await tx.run(sql`INSERT INTO cards (id, column_id, title, description, position)
        VALUES (${data.id}, ${columnId}, ${data.title}, ${data.description ?? null}, ${next_position})`)
    }
    if (this.db.transactionSync) {
      this.db.transactionSync((tx) => {
        const column = tx.all<ColumnRow>(sql`SELECT id, board_id FROM columns WHERE id = ${columnId}`)[0]
        if (!column) throw new ApiError(404, 'Column not found')
        if (tx.all(sql`SELECT id FROM cards WHERE id = ${data.id}`).length) throw new ApiError(409, 'Card ID already exists')
        const [{ next_position }] = tx.all<{ next_position: number }>(sql`
          SELECT COALESCE(MAX(position) + 1, 0) AS next_position FROM cards WHERE column_id = ${columnId}`)
        tx.run(sql`INSERT INTO cards (id, column_id, title, description, position)
          VALUES (${data.id}, ${columnId}, ${data.title}, ${data.description ?? null}, ${next_position})`)
      })
    } else await this.db.transaction(create)
    return data
  }

  async patch(id: string, changes: { title?: string; description?: string | null }): Promise<CardData> {
    const updates = [
      ...(changes.title === undefined ? [] : [sql`title = ${changes.title}`]),
      ...(changes.description === undefined ? [] : [sql`description = ${changes.description}`]),
    ]
    const [card] = await this.db.all<CardRow>(sql`
      UPDATE cards SET ${sql.join(updates, sql`, `)} WHERE id = ${id}
      RETURNING id, title, description, column_id`)
    if (!card) throw new ApiError(404, 'Card not found')
    return cardData(card)
  }

  async move(id: string, destination: string, position?: number): Promise<BoardData> {
    // The same ordering calculation is used inside both dialects' transactions.
    const plan = (card: CardRow | undefined, target: ColumnRow | undefined,
      source: OrderRow[], dest: OrderRow[]) => {
      if (!card) throw new ApiError(404, 'Card not found')
      if (!target) throw new ApiError(404, 'Column not found')
      const sourceIds = source.map((row) => row.id).filter((cardId) => cardId !== id)
      const destinationIds = card.column_id === destination ? sourceIds : dest.map((row) => row.id)
      const index = position ?? destinationIds.length
      if (index < 0 || index > destinationIds.length) throw new ApiError(400, 'Position out of range')
      destinationIds.splice(index, 0, id)
      return { sourceIds, destinationIds, boardId: target.board_id, sourceColumn: card.column_id }
    }
    const selectCard = sql`SELECT id, title, description, column_id FROM cards WHERE id = ${id}`
    const selectTarget = sql`SELECT id, board_id FROM columns WHERE id = ${destination}`
    const list = (columnId: string) => sql`SELECT id FROM cards WHERE column_id = ${columnId} ORDER BY position, id`
    let boardId: string
    if (this.db.transactionSync) {
      boardId = this.db.transactionSync((tx) => {
        const card = tx.all<CardRow>(selectCard)[0]
        const target = tx.all<ColumnRow>(selectTarget)[0]
        if (!card) throw new ApiError(404, 'Card not found')
        if (!target) throw new ApiError(404, 'Column not found')
        const source = tx.all<OrderRow>(list(card.column_id))
        const dest = card.column_id === destination ? source : tx.all<OrderRow>(list(destination))
        const order = plan(card, target, source, dest)
        const origin = tx.all<ColumnRow>(sql`SELECT id, board_id FROM columns WHERE id = ${card.column_id}`)[0]
        if (origin.board_id !== target.board_id) throw new ApiError(400, 'Card must stay on its board')
        for (const [index, cardId] of order.sourceIds.entries())
          tx.run(sql`UPDATE cards SET position = ${index} WHERE id = ${cardId}`)
        for (const [index, cardId] of order.destinationIds.entries())
          tx.run(sql`UPDATE cards SET column_id = ${destination}, position = ${index} WHERE id = ${cardId}`)
        return order.boardId
      })
    } else {
      boardId = await this.db.transaction(async (tx) => {
        // Lock the board before reading order so simultaneous moves cannot overwrite each other.
        const initial = (await tx.all<CardRow>(selectCard))[0]
        const target = (await tx.all<ColumnRow>(selectTarget))[0]
        if (!initial) throw new ApiError(404, 'Card not found')
        if (!target) throw new ApiError(404, 'Column not found')
        const origin = (await tx.all<ColumnRow>(sql`SELECT id, board_id FROM columns WHERE id = ${initial.column_id}`))[0]
        if (origin.board_id !== target.board_id) throw new ApiError(400, 'Card must stay on its board')
        await tx.run(sql`SELECT id FROM boards WHERE id = ${target.board_id} FOR UPDATE`)
        const card = (await tx.all<CardRow>(selectCard))[0]
        if (!card) throw new ApiError(404, 'Card not found')
        const source = await tx.all<OrderRow>(list(card.column_id))
        const dest = card.column_id === destination ? source : await tx.all<OrderRow>(list(destination))
        const order = plan(card, target, source, dest)
        for (const [index, cardId] of order.sourceIds.entries())
          await tx.run(sql`UPDATE cards SET position = ${index} WHERE id = ${cardId}`)
        for (const [index, cardId] of order.destinationIds.entries())
          await tx.run(sql`UPDATE cards SET column_id = ${destination}, position = ${index} WHERE id = ${cardId}`)
        return order.boardId
      })
    }
    return (await this.board(boardId))!
  }
}
