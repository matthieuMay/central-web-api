# Mini-Trello API

Teacher-provided local API for the optional Day 2 Sprint 1 Query bonus and the
common Sprint 2 movement exercise. Node.js + TypeScript + Express + Drizzle.
The board response matches the Front `BoardData` shape; the initial board is
copied from Prep's `mirrors/front/data/board.json` into `src/db/board.json`.

## Day 2: Postgres (default)

Requires Node.js 22+ and Docker Compose. From this repository:

```bash
cp .env.example .env
npm ci
docker compose -f docker-compose.yml -f docker-compose.j2.yml up -d db pgweb
docker compose -f docker-compose.yml -f docker-compose.j2.yml ps  # wait for db: healthy
npm run db:migrate   # repeatable migration; seeds only when the board is absent
npm run dev
```

API: <http://localhost:3000> (`GET /health` checks the process). pgweb:
<http://localhost:8081> — inspect the `boards`, `columns`, and `cards` tables;
`position` is zero-based storage order. pgweb connects to the Compose `db`
service automatically. The J2 overlay adds pgweb and a Postgres health check;
the original **J1** `docker compose up -d` still starts Postgres and pgAdmin at
<http://localhost:5050> with its original exercise and named volumes intact.
Stopping Compose without `-v` preserves Postgres data.

### Original J1 Docker exercise

The unmodified `docker-compose.yml` still starts `db` and `pgadmin` with
`docker compose up -d`. At <http://localhost:5050>, sign in to pgAdmin with
`admin@example.com` / `admin`; register a server at host `db`, port `5432`,
database `trello`, user `trello`, password `trello`. The hostname `db` works
inside the Compose network (the API on the host uses `localhost`). To check
that its named volume survives container recreation:

```bash
docker compose exec -T db psql -U trello -d trello -c \
  "create table if not exists compose_check (message text); insert into compose_check values ('persists');"
docker compose down
docker compose up -d
docker compose exec -T db psql -U trello -d trello -c "select * from compose_check;"
```

Do not use `docker compose down -v` unless you intend to delete the J1 data.

### File-backed SQLite instead

Set `DB_DRIVER=sqlite` in `.env` (or prefix a command with `DB_DRIVER=sqlite`).
`SQLITE_PATH=./data/trello.sqlite` selects the file; Docker is unnecessary.
Run `npm run db:migrate` then `npm run dev`. Startup also migrates/seeds when
needed. Changing drivers selects **different** databases; it does not copy
cards between them.

`npm run db:reset` deliberately restores the seed board **in the selected
database**. Normal migrations and restarts preserve cards, edits and moves;
Sprint 2 does not require resetting after Sprint 1. SQLite files and `.env`
are ignored by Git. The source-controlled Drizzle migrations live in
`drizzle/postgres/` and `drizzle/sqlite/`.

## Try the four Day 2 routes

All responses, including errors, are JSON. The default allowed Vite origin is
`http://localhost:5173`; set `CORS_ORIGIN` in `.env` to change it. Front can
set `VITE_API_URL=http://localhost:3000`. It already includes
`@tanstack/react-query`, but needs a UUID v7 generator dependency for the
Sprint 1 bonus (for example `uuid`); `crypto.randomUUID()` produces v4.

```bash
curl http://localhost:3000/boards/mini-trello
CARD_ID=$(node --input-type=module -e "import { v7 } from 'uuid'; console.log(v7())")
curl -X POST http://localhost:3000/columns/review/cards -H 'Content-Type: application/json' \
  -d "{\"id\":\"$CARD_ID\",\"title\":\"New card\"}"
curl -X PATCH "http://localhost:3000/cards/$CARD_ID" -H 'Content-Type: application/json' \
  -d '{"title":"Updated title","description":"Details"}'
curl -X PUT "http://localhost:3000/cards/$CARD_ID" -H 'Content-Type: application/json' \
  -d '{"column":"done"}'
```

POST appends and returns the created Card; PATCH accepts `title`, `description`,
or both (`null` clears description); PUT returns the entire updated Board.
Omitting `position` on PUT appends; an optional integer `position` places the
card at that zero-based index after removal. GET after a move verifies its
persisted location. The seed's `card-1`–`card-6` IDs remain editable; only
**new** IDs must be UUID v7.

## Verify

```bash
npm run typecheck
npm test                         # isolated temporary SQLite database
# For Postgres tests, first create a dedicated test DB (once):
docker compose -f docker-compose.yml -f docker-compose.j2.yml exec -T db createdb -U trello trello_test
TEST_POSTGRES=1 TEST_DATABASE_URL=postgres://trello:trello@localhost:5432/trello_test npm test
```

The Postgres test resets the seed board in `trello_test`, never in the teacher's
default `trello` database. These tests exercise HTTP and database persistence;
Front interaction flows require separate integration verification with the
relevant Front snapshot.
