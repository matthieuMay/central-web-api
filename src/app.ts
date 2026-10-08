import cors from 'cors'
import express, { type RequestHandler } from 'express'
import { ApiError, Store, type CardCollections } from './db/store.js'

const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).some((key) => !keys.includes(key))) throw new ApiError(400, 'Invalid request body')
  return value as Record<string, unknown>
}

function title(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ApiError(400, 'Title must be nonblank')
  return value.trim()
}

function collections(data: Record<string, unknown>): Partial<CardCollections> {
  const changes: Partial<CardCollections> = {}
  if ('assignees' in data) {
    if (!Array.isArray(data.assignees) ||
        data.assignees.some((id: unknown) => typeof id !== 'string' || !id) ||
        new Set(data.assignees).size !== data.assignees.length)
      throw new ApiError(400, 'Invalid assignees')
    changes.assignees = data.assignees as string[]
  }
  if ('comments' in data) {
    if (!Array.isArray(data.comments)) throw new ApiError(400, 'Invalid comments')
    changes.comments = data.comments.map((entry: unknown) => {
      const comment = object(entry, ['user', 'comment'])
      if (typeof comment.user !== 'string' || !comment.user ||
          typeof comment.comment !== 'string' || !comment.comment.trim())
        throw new ApiError(400, 'Invalid comments')
      return { user: comment.user, comment: comment.comment.trim() }
    })
  }
  if ('checklistItems' in data) {
    if (!Array.isArray(data.checklistItems)) throw new ApiError(400, 'Invalid checklist items')
    changes.checklistItems = data.checklistItems.map((entry: unknown) => {
      const item = object(entry, ['description', 'done'])
      if (typeof item.description !== 'string' || !item.description.trim() || typeof item.done !== 'boolean')
        throw new ApiError(400, 'Invalid checklist items')
      return { description: item.description.trim(), done: item.done }
    })
  }
  return changes
}

function param(value: string | string[]): string {
  if (typeof value !== 'string') throw new ApiError(400, 'Invalid path parameter')
  return value
}

const asyncRoute = (route: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve(route(req, res, next)).catch(next)
}

export function createApp(store: Store) {
  const app = express()
  app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }))
  app.use(express.json())

  app.get('/health', (_req, res) => { res.json({ ok: true }) })
  app.get('/users', asyncRoute(async (_req, res) => {
    res.json(await store.users())
  }))
  app.get('/boards/:id', asyncRoute(async (req, res) => {
    const board = await store.board(param(req.params.id))
    if (!board) throw new ApiError(404, 'Board not found')
    res.json(board)
  }))
  app.post('/columns/:columnId/cards', asyncRoute(async (req, res) => {
    const data = object(req.body, ['id', 'title', 'description', 'assignees', 'comments', 'checklistItems'])
    if (typeof data.id !== 'string' || !uuidV7.test(data.id)) throw new ApiError(400, 'ID must be a UUID v7')
    const cardTitle = title(data.title)
    if (data.description !== undefined && typeof data.description !== 'string')
      throw new ApiError(400, 'Description must be text')
    const card = await store.create(param(req.params.columnId), {
      id: data.id, title: cardTitle,
      ...(data.description === undefined ? {} : { description: data.description as string }),
      ...collections(data),
    })
    res.status(201).json(card)
  }))
  app.patch('/cards/:cardId', asyncRoute(async (req, res) => {
    const data = object(req.body, ['title', 'description', 'assignees', 'comments', 'checklistItems'])
    if (!Object.keys(data).length) throw new ApiError(400, 'Patch cannot be empty')
    if ('description' in data && data.description !== null && typeof data.description !== 'string')
      throw new ApiError(400, 'Description must be text or null')
    const changes = {
      ...('title' in data ? { title: title(data.title) } : {}),
      ...('description' in data ? { description: data.description as string | null } : {}),
      ...collections(data),
    }
    res.json(await store.patch(param(req.params.cardId), changes))
  }))
  app.put('/cards/:cardId', asyncRoute(async (req, res) => {
    const data = object(req.body, ['column', 'position'])
    if (typeof data.column !== 'string' || !data.column) throw new ApiError(400, 'Column is required')
    if ('position' in data && (!Number.isInteger(data.position) || !Number.isSafeInteger(data.position)))
      throw new ApiError(400, 'Position must be an integer')
    res.json(await store.move(param(req.params.cardId), data.column, data.position as number | undefined))
  }))

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof ApiError) { res.status(err.status).json({ error: err.message }); return }
    if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
      res.status(400).json({ error: 'Invalid JSON' }); return
    }
    const code = (err as { code?: string })?.code
    if (code === '23505' || code?.startsWith('SQLITE_CONSTRAINT')) {
      res.status(409).json({ error: 'Card ID already exists' }); return
    }
    console.error(err)
    res.status(500).json({ error: 'Internal server error' })
  })
  return app
}
