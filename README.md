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

## Agent skills

See `AGENTS.md` and `docs/agents/`.
