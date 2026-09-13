# API — Agent instructions

## Commands

```bash
cp .env.example .env
npm install
npm run dev
```

Postgres: `docker compose up -d` then `DB_DRIVER=postgres` in `.env`.

## Domain

Read `CONTEXT.md` before changing Board / Column / Card resources.

## Agent skills

### Issue tracker

Issues live in this repo's GitHub Issues (`gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.
