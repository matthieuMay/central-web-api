import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** Shared logical schema — SQLite column types; Postgres mapped in db client when needed. */
export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})

export const columns = sqliteTable('columns', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .notNull()
    .references(() => boards.id),
  title: text('title').notNull(),
  position: integer('position').notNull().default(0),
})

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  columnId: text('column_id')
    .notNull()
    .references(() => columns.id),
  title: text('title').notNull(),
  position: integer('position').notNull().default(0),
})
