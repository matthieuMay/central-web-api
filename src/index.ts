import 'dotenv/config'
import { createApp } from './app.js'
import { createDb } from './db/client.js'
import { prepare } from './db/migrate.js'
import { Store } from './db/store.js'

const db = createDb()
try {
  await prepare(db)
  const port = Number(process.env.PORT ?? 3000)
  const server = createApp(new Store(db)).listen(port, () => {
    console.log(`API listening on http://localhost:${port}`)
  })
  const shutdown = () => server.close(() => { void db.close() })
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
} catch (error) {
  await db.close()
  console.error(error)
  process.exitCode = 1
}
