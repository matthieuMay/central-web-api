# Mini-Trello API

REST API for the Centrale React course. Node + TypeScript + Express + Drizzle.

- Default DB: **SQLite** (`DB_DRIVER=sqlite`)
- Docker TP: **Postgres** (`DB_DRIVER=postgres` + `docker compose up`)

## Quick start

```bash
cp .env.example .env
npm install
npm run dev
```

Health: `GET http://localhost:3000/health`

## Postgres development environment

SQLite remains the default database. The Compose environment is an optional
development setup that requires Docker Desktop, or a compatible Docker Engine
with Compose v2.

The committed credentials are for local teaching only. Never use them in
production or for publicly reachable services.

Start and inspect the services:

```bash
docker compose up -d
docker compose ps
docker compose logs db
```

Set `DB_DRIVER=postgres` in `.env` to run the API against Postgres. The existing
`DATABASE_URL=postgres://trello:trello@localhost:5432/trello` connects from the
host.

pgAdmin is available at <http://localhost:5050>. Sign in with
`admin@example.com` / `admin`, then register a server with these connection
values:

| Field | Value |
| --- | --- |
| Host name/address | `db` |
| Port | `5432` |
| Maintenance database | `trello` |
| Username | `trello` |
| Password | `trello` |

Compose provides the default network where the service name `db` resolves to
Postgres. pgAdmin is an optional development interface; the API does not need
it at runtime.

### Verify persistence

Create a table and row:

```bash
docker compose exec -T db psql -U trello -d trello -c \
  "create table if not exists compose_check (message text); insert into compose_check values ('persists');"
```

Recreate the containers without deleting their named volumes, then verify the
row remains:

```bash
docker compose down
docker compose up -d
docker compose exec -T db psql -U trello -d trello -c \
  "select * from compose_check;"
```

Stop the services with `docker compose down`. Do not add `-v` unless you intend
to delete the exercise data: `docker compose down -v` deletes both named
volumes.

Using the same Postgres and pgAdmin images across environments can make
development closer to production, but it does not make the environments
identical. This Compose file is a development tool, not the production
deployment architecture.

## Agent skills

See `AGENTS.md` and `docs/agents/`.
