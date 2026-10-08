import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/** SQLite schema for file-backed development. */
export const boards = sqliteTable('boards', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
})

export const columns = sqliteTable('columns', {
  id: text('id').primaryKey(),
  boardId: text('board_id')
    .notNull()
    .references(() => boards.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  position: integer('position').notNull().default(0),
})

export const cards = sqliteTable('cards', {
  id: text('id').primaryKey(),
  columnId: text('column_id')
    .notNull()
    .references(() => columns.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  position: integer('position').notNull().default(0),
  assignees: text('assignees').notNull().default('[]'),
  comments: text('comments').notNull().default('[]'),
  checklistItems: text('checklist_items').notNull().default('[]'),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  firstname: text('firstname').notNull(),
  lastname: text('lastname').notNull(),
})
