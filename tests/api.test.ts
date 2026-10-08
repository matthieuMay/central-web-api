import 'dotenv/config'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { once } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { v7 } from 'uuid'
import { createApp } from '../src/app.js'
import boardFixture from '../src/db/board.json' with { type: 'json' }
import { createDb, sql, type Connection } from '../src/db/client.js'
import { prepare } from '../src/db/migrate.js'
import { seed } from '../src/db/seed.js'
import { Store, type BoardData, type UserData } from '../src/db/store.js'

const execFileAsync = promisify(execFile)

async function suite(driver: 'sqlite' | 'postgres') {
  const postgresUrl = driver === 'postgres' ? process.env.TEST_DATABASE_URL : undefined
  if (driver === 'postgres' && (!postgresUrl || !new URL(postgresUrl).pathname.endsWith('_test')))
    throw new Error('TEST_DATABASE_URL must point to a dedicated *_test database')
  const dir = mkdtempSync(join(tmpdir(), 'mini-trello-'))
  process.env.SQLITE_PATH = join(dir, 'board.sqlite')
  if (postgresUrl) process.env.DATABASE_URL = postgresUrl
  const connect = () => createDb(driver)
  let db: Connection = connect()
  let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined
  try {
    await prepare(db)
    // This resets only the dedicated TEST_DATABASE_URL database.
    if (driver === 'postgres') await seed(db, true)
    server = createApp(new Store(db)).listen(0)
    await once(server, 'listening')
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    let base = `http://localhost:${address.port}`
    const request = async (path: string, method = 'GET', body?: unknown) => {
      const response = await fetch(base + path, {
        method, headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      return { status: response.status, body: await response.json(), headers: response.headers }
    }
    const expectError = async (path: string, method: string, body: unknown,
      status: number, error: string) => {
      const response = await request(path, method, body)
      assert.equal(response.status, status)
      assert.deepEqual(response.body, { error })
    }
    const health = await request('/health')
    assert.equal(health.status, 200)
    assert.deepEqual(health.body, { ok: true })
    const initialUsers = await request('/users')
    assert.equal(initialUsers.status, 200)
    const users = initialUsers.body as UserData[]
    assert.equal(users.length, 10)
    assert.equal(new Set(users.map((user) => user.id)).size, 10)
    assert.equal(new Set(users.map((user) => `${user.firstname} ${user.lastname}`)).size, 10)
    for (const user of users) {
      assert.deepEqual(Object.keys(user), ['id', 'firstname', 'lastname'])
      assert.match(user.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
      assert.ok(user.firstname && user.lastname)
    }
    const extraId = v7()
    await db.run(sql`INSERT INTO users (id, firstname, lastname) VALUES (${extraId}, ${'Ada'}, ${'Lovelace'})`)
    const usersWithExtra = (await request('/users')).body as UserData[]
    assert.equal(usersWithExtra.length, 11)
    const initial = await request('/boards/mini-trello')
    assert.equal(initial.status, 200)
    const board = initial.body as BoardData
    const empty = { assignees: [], comments: [], checklistItems: [] }
    const seededBoard = {
      ...boardFixture,
      columns: boardFixture.columns.map((column) => ({
        ...column, cards: column.cards.map((card) => ({ ...card, ...empty })),
      })),
    }
    assert.deepEqual(board, seededBoard)
    assert.equal(board.id, 'mini-trello')
    assert.equal(board.title, 'Sprint board 🚀')
    assert.deepEqual(board.columns.map((col) => col.id), ['sprint-backlog', 'doing', 'review', 'done'])
    assert.deepEqual(board.columns.map((col) => col.cards.map((card) => card.id)),
      [['card-1', 'card-2', 'card-3'], ['card-4', 'card-5'], [], ['card-6']])
    assert.deepEqual(board.columns[0].cards[0], {
      id: 'card-1', title: 'Sketch the board layout ✏️',
      description: 'Keep the four columns readable on small screens.',
      ...empty,
    })
    assert.deepEqual(board.columns[1].cards[0], {
      id: 'card-4', title: 'Build the Column component',
      description: 'Render each card from the JSON data.',
      ...empty,
    })
    assert.deepEqual(Object.keys(board.columns[2]), ['id', 'title', 'cards'])
    await expectError('/boards/unknown', 'GET', undefined, 404, 'Board not found')
    assert.equal((await request('/boards/mini-trello')).headers.get('access-control-allow-origin'),
      process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    const preflight = await fetch(base + '/cards/card-1', {
      method: 'OPTIONS',
      headers: {
        Origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
        'Access-Control-Request-Method': 'PATCH',
        'Access-Control-Request-Headers': 'content-type',
      },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'),
      process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /PATCH/)
    assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /content-type/i)

    const malformed = await fetch(base + '/cards/card-1', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: '{',
    })
    assert.equal(malformed.status, 400)
    assert.deepEqual(await malformed.json(), { error: 'Invalid JSON' })

    const id = v7()
    await expectError('/columns/review/cards', 'POST', { id: 'card-7', title: 'No' },
      400, 'ID must be a UUID v7')
    await expectError('/columns/missing/cards', 'POST', { id: v7(), title: 'New' },
      404, 'Column not found')
    for (const invalid of [
      { title: 'No ID' }, { id: '00000000-0000-4000-8000-000000000000', title: 'v4' },
    ]) await expectError('/columns/review/cards', 'POST', invalid, 400, 'ID must be a UUID v7')
    for (const invalid of [
      { id: v7(), title: 1 }, { id: v7(), title: '  ' },
    ]) await expectError('/columns/review/cards', 'POST', invalid, 400, 'Title must be nonblank')
    for (const invalid of [
      { id: v7(), title: 'Test', description: null },
      { id: v7(), title: 'Test', description: 12 },
    ]) await expectError('/columns/review/cards', 'POST', invalid, 400, 'Description must be text')
    await expectError('/columns/review/cards', 'POST', { id: v7(), title: 'Test', position: 0 },
      400, 'Invalid request body')
    const entries = {
      assignees: [users[1].id, users[0].id],
      comments: [{ user: users[0].id, comment: ' First note ' }, { user: users[1].id, comment: 'Second' }],
      checklistItems: [{ description: ' First step ', done: false }, { description: 'Second step', done: true }],
    }
    const normalized = {
      assignees: entries.assignees,
      comments: [{ user: users[0].id, comment: 'First note' }, { user: users[1].id, comment: 'Second' }],
      checklistItems: [{ description: 'First step', done: false }, { description: 'Second step', done: true }],
    }
    const created = await request('/columns/doing/cards', 'POST', {
      id, title: '  New task  ', description: 'Saved', ...entries,
    })
    assert.equal(created.status, 201)
    assert.deepEqual(created.body, { id, title: 'New task', description: 'Saved', ...normalized })
    await expectError('/columns/doing/cards', 'POST', { id, title: 'Duplicate' },
      409, 'Card ID already exists')
    assert.deepEqual((await request('/boards/mini-trello')).body.columns[1].cards.map((c: { id: string }) => c.id),
      ['card-4', 'card-5', id])
    assert.deepEqual((await request('/boards/mini-trello')).body.columns[1].cards.at(-1), created.body)
    const missingUser = v7()
    for (const invalid of [
      { assignees: [missingUser] }, { comments: [{ user: missingUser, comment: 'Note' }] },
      { assignees: [users[0].id, users[0].id] }, { assignees: null },
      { comments: [{ user: users[0].id, comment: '  ' }] },
      { comments: [{ user: users[0].id, comment: 'ok', id: 'unexpected' }] },
      { checklistItems: [{ description: ' ', done: false }] },
      { checklistItems: [{ description: 'Step' }] },
      { checklistItems: [{ description: 'Step', done: 1 }] },
    ]) {
      const failedId = v7()
      const response = await request('/columns/doing/cards', 'POST', { id: failedId, title: 'Test', ...invalid })
      assert.equal(response.status, 400)
      assert.equal((await request('/boards/mini-trello')).body.columns[1].cards.some(
        (card: { id: string }) => card.id === failedId), false)
    }

    await expectError('/cards/card-1', 'PATCH', {}, 400, 'Patch cannot be empty')
    await expectError('/cards/card-1', 'PATCH', { title: '  ' }, 400, 'Title must be nonblank')
    await expectError('/cards/card-1', 'PATCH', { title: 7 }, 400, 'Title must be nonblank')
    await expectError('/cards/card-1', 'PATCH', { description: 7 },
      400, 'Description must be text or null')
    await expectError('/cards/card-1', 'PATCH', { column: 'review' }, 400, 'Invalid request body')
    await expectError('/cards/nope', 'PATCH', { title: 'Test' }, 404, 'Card not found')
    const beforeInvalidPatch = (await request('/boards/mini-trello')).body
    for (const invalid of [
      { assignees: [missingUser] }, { comments: [{ user: missingUser, comment: 'Note' }] },
      { assignees: [users[0].id, users[0].id] }, { assignees: null },
      { comments: [{ user: users[0].id, comment: '' }] },
      { checklistItems: [{ description: 'Task', done: null }] },
    ]) {
      const response = await request(`/cards/${id}`, 'PATCH', { title: 'Must not change', ...invalid })
      assert.equal(response.status, 400)
      assert.deepEqual((await request('/boards/mini-trello')).body, beforeInvalidPatch)
    }
    assert.deepEqual((await request('/cards/card-1', 'PATCH', { title: ' Edited ', description: 'Changed' })).body,
      { id: 'card-1', title: 'Edited', description: 'Changed', ...empty })
    assert.deepEqual((await request('/cards/card-1', 'PATCH', { description: null })).body,
      { id: 'card-1', title: 'Edited', ...empty })
    assert.deepEqual((await request('/cards/card-1', 'PATCH', { description: 'Restored' })).body,
      { id: 'card-1', title: 'Edited', description: 'Restored', ...empty })
    assert.deepEqual((await request('/cards/card-1', 'PATCH', { description: null })).body,
      { id: 'card-1', title: 'Edited', ...empty })
    assert.deepEqual((await request(`/cards/${id}`, 'PATCH', { title: ' Renamed ' })).body,
      { id, title: 'Renamed', description: 'Saved', ...normalized })
    const replaced = {
      assignees: [users[0].id],
      comments: [{ user: users[1].id, comment: 'Updated' }],
      checklistItems: [{ description: 'First step', done: true }],
    }
    assert.deepEqual((await request(`/cards/${id}`, 'PATCH', replaced)).body,
      { id, title: 'Renamed', description: 'Saved', ...replaced })
    assert.deepEqual((await request(`/cards/${id}`, 'PATCH', { comments: [] })).body,
      { id, title: 'Renamed', description: 'Saved', ...replaced, comments: [] })

    const before = (await request('/boards/mini-trello')).body
    for (const invalid of [
      { column: 'review', position: -1 }, { column: 'review', position: 1 },
      { column: 'review', position: 0.5 }, { column: 'review', position: '0' },
      { column: 'review', position: null }, { column: 1 },
      { column: 'missing' }, { column: 'review', title: 'No' },
    ]) {
      const response = await request('/cards/card-4', 'PUT', invalid)
      assert.equal(response.status, invalid.column === 'missing' ? 404 : 400)
      assert.deepEqual((await request('/boards/mini-trello')).body, before)
    }
    await expectError('/cards/nope', 'PUT', { column: 'review' }, 404, 'Card not found')
    await expectError('/cards/card-4', 'PUT', { column: 'review', position: 0.5 },
      400, 'Position must be an integer')
    const intoReview = await request('/cards/card-4', 'PUT', { column: 'review' })
    assert.equal(intoReview.status, 200)
    assert.deepEqual(intoReview.body.columns[2].cards.map((c: { id: string }) => c.id), ['card-4'])
    assert.deepEqual((await request('/boards/mini-trello')).body, intoReview.body)
    const intoDone = await request('/cards/card-4', 'PUT', { column: 'done' })
    assert.deepEqual(intoDone.body.columns[3].cards.map((c: { id: string }) => c.id), ['card-6', 'card-4'])
    assert.deepEqual(intoDone.body.columns[2].cards, [])
    const reviewId = v7()
    const inEmptyReview = await request('/columns/review/cards', 'POST', { id: reviewId, title: '  Review me  ' })
    assert.equal(inEmptyReview.status, 201)
    assert.deepEqual(inEmptyReview.body, { id: reviewId, title: 'Review me', ...empty })
    assert.deepEqual((await request('/boards/mini-trello')).body.columns[2].cards,
      [{ id: reviewId, title: 'Review me', ...empty }])
    assert.deepEqual((await request('/cards/card-4', 'PUT', { column: 'done', position: 0 })).body
      .columns[3].cards.map((c: { id: string }) => c.id), ['card-4', 'card-6'])
    assert.deepEqual((await request('/cards/card-4', 'PUT', { column: 'done', position: 1 })).body
      .columns[3].cards.map((c: { id: string }) => c.id), ['card-6', 'card-4'])
    assert.deepEqual((await request('/cards/card-6', 'PUT', { column: 'done', position: 1 })).body
      .columns[3].cards.map((c: { id: string }) => c.id), ['card-4', 'card-6'])
    assert.deepEqual((await request('/boards/mini-trello')).body.columns[3].cards.map((c: { id: string }) => c.id),
      ['card-4', 'card-6'])
    const simultaneous = await Promise.all([
      request('/cards/card-2', 'PUT', { column: 'review' }),
      request('/cards/card-3', 'PUT', { column: 'review' }),
    ])
    assert.deepEqual(simultaneous.map((result) => result.status), [200, 200])
    const reviewOrder = (await request('/boards/mini-trello')).body.columns[2].cards
      .map((c: { id: string }) => c.id) as string[]
    assert.equal(reviewOrder[0], reviewId)
    assert.deepEqual(reviewOrder.slice(1).sort(), ['card-2', 'card-3'])

    await new Promise<void>((resolve) => server!.close(() => resolve()))
    server = undefined
    await db.close()
    db = connect()
    await prepare(db) // Must not overwrite cards, edits or positions on restart.
    server = createApp(new Store(db)).listen(0)
    await once(server, 'listening')
    const restartedAddress = server.address()
    assert.ok(restartedAddress && typeof restartedAddress !== 'string')
    base = `http://localhost:${restartedAddress.port}`
    const persistedResponse = await fetch(base + '/boards/mini-trello')
    assert.equal(persistedResponse.status, 200)
    const persisted = await persistedResponse.json() as BoardData
    assert.equal(persisted.columns[0].cards[0].title, 'Edited')
    assert.deepEqual(persisted.columns[3].cards.map((card) => card.id), ['card-4', 'card-6'])
    assert.deepEqual(persisted.columns[2].cards.map((card) => card.id), reviewOrder)
    assert.deepEqual(persisted.columns[1].cards.at(-1),
      { id, title: 'Renamed', description: 'Saved', ...replaced, comments: [] })
    assert.deepEqual((await request('/users')).body, usersWithExtra)
    await seed(db, true)
    assert.deepEqual(await new Store(db).board('mini-trello'), board)
    const resetUsers = (await request('/users')).body as UserData[]
    assert.equal(resetUsers.length, 10)
    assert.ok(resetUsers.every((user) => user.id !== extraId && !users.some((old) => old.id === user.id)))
    assert.equal((await request('/cards/card-1', 'PATCH', { title: 'Changed again' })).status, 200)
    await execFileAsync('npm', ['run', 'db:reset'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, DB_DRIVER: driver, SQLITE_PATH: join(dir, 'board.sqlite') },
    })
    const restored = await fetch(base + '/boards/mini-trello')
    assert.equal(restored.status, 200)
    assert.deepEqual(await restored.json(), seededBoard)
    const commandResetUsers = (await request('/users')).body as UserData[]
    assert.equal(commandResetUsers.length, 10)
    assert.ok(commandResetUsers.every((user) => !resetUsers.some((old) => old.id === user.id)))
  } finally {
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()))
    await db.close()
    rmSync(dir, { recursive: true, force: true })
  }
}

test('J2 contract and restart/reset on SQLite', () => suite('sqlite'))
if (process.env.TEST_POSTGRES === '1') {
  test('J2 contract and restart/reset on Postgres', () => suite('postgres'))
}
