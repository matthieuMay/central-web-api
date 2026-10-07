import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const driver = process.env.DB_DRIVER ?? 'postgres'

export default defineConfig(
  driver === 'postgres'
    ? {
        schema: './src/db/schema.postgres.ts',
        out: './drizzle/postgres',
        dialect: 'postgresql',
        dbCredentials: { url: process.env.DATABASE_URL! },
      }
    : {
        schema: './src/db/schema.ts',
        out: './drizzle/sqlite',
        dialect: 'sqlite',
        dbCredentials: { url: process.env.SQLITE_PATH ?? './data/trello.sqlite' },
      },
)
