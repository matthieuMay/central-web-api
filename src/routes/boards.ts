import { Router } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../db/client.js'
import { boards, cards, columns } from '../db/schema.js'

export const boardsRouter = Router()

boardsRouter.get('/:id', async (req, res) => {
  const boardId = req.params.id
  const [board] = await db.select().from(boards).where(eq(boards.id, boardId))
  if (!board) {
    res.status(404).json({ error: 'Board not found' })
    return
  }

  const cols = await db.select().from(columns).where(eq(columns.boardId, boardId))
  const result = []
  for (const col of cols) {
    const colCards = await db.select().from(cards).where(eq(cards.columnId, col.id))
    result.push({ ...col, cards: colCards })
  }

  res.json({ ...board, columns: result })
})
