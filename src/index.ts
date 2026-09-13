import 'dotenv/config'
import cors from 'cors'
import express from 'express'
import { boardsRouter } from './routes/boards.js'

const app = express()
const port = Number(process.env.PORT ?? 3000)

app.use(cors())
app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/boards', boardsRouter)

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`)
})
