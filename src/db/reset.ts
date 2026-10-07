import 'dotenv/config'
import { createDb } from './client.js'
import { prepare } from './migrate.js'
import { seed } from './seed.js'

const db = createDb()
try {
  await prepare(db)
  await seed(db, true)
  console.log('Initial board restored')
} finally {
  await db.close()
}
