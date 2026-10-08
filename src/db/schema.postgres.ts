import { integer, pgTable, text } from 'drizzle-orm/pg-core'

export const boards = pgTable('boards', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})

export const columns = pgTable('columns', {
  id: text('id').primaryKey(),
  boardId: text('board_id').notNull().references(() => boards.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  position: integer('position').notNull(),
})

export const cards = pgTable('cards', {
  id: text('id').primaryKey(),
  columnId: text('column_id').notNull().references(() => columns.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  position: integer('position').notNull(),
})

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  firstname: text('firstname').notNull(),
  lastname: text('lastname').notNull(),
})
