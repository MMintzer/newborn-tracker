# newborn-tracker

A small REST API for logging a newborn's daily events (diapers, feedings,
sleep, weight) and getting a last-24h rollup.

Stack: **Node.js**, **Express**, **better-sqlite3**, **zod**. No other
frameworks.

## Requirements

- Node.js 18+ (uses `crypto.randomUUID`)

## Run

```bash
npm install
npm start
```

The server listens on `http://localhost:3000` (override with `PORT`). On
startup it creates a SQLite file at `./data.db` (override with `DB_FILE`) and
creates the tables if they don't exist.

## Data model

- **baby**: `{ id, name, birthdate }` — `birthdate` is a calendar date
  (`YYYY-MM-DD`).
- **event**: `{ id, babyId, type, createdAt, details }` where `type` is one of
  `diaper | feeding | sleep | weight`, `createdAt` is an ISO-8601 UTC timestamp
  set by the server, and `details` depends on `type`:
  - `diaper`:  `{ kind: "wet" | "dirty" | "both" }`
  - `feeding`: `{ method: "breast" | "bottle", amountMl?, durationMin? }`
  - `sleep`:   `{ startedAt, endedAt }` (ISO-8601 UTC timestamps)
  - `weight`:  `{ kg }`

## Response envelope

Every response uses the same shape:

```json
{ "data": ..., "error": null }
```

On error, `data` is `null` and `error` is `{ "message": ..., "fields"?: [...] }`.
Validation failures return **422** with field-level errors:

```json
{
  "data": null,
  "error": {
    "message": "Validation failed",
    "fields": [{ "field": "details.kind", "message": "Invalid enum value..." }]
  }
}
```

Unknown fields in a request body are rejected.

## Endpoints

| Method | Path                    | Description                                   |
| ------ | ----------------------- | --------------------------------------------- |
| POST   | `/babies`               | Create a baby profile                         |
| POST   | `/babies/:id/events`    | Log an event                                  |
| GET    | `/babies/:id/events`    | List events; filter with `?type=` & `?since=` |
| GET    | `/babies/:id/summary`   | Last-24h rollup                               |

`?since=` takes an ISO-8601 UTC timestamp and returns events with
`createdAt >= since`.

## Example curl commands

Create a baby (capture the returned id):

```bash
curl -s -X POST http://localhost:3000/babies \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada","birthdate":"2026-06-01"}'
```

```bash
BABY=$(curl -s -X POST http://localhost:3000/babies \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada","birthdate":"2026-06-01"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.id')
```

Log a diaper event:

```bash
curl -s -X POST http://localhost:3000/babies/$BABY/events \
  -H 'Content-Type: application/json' \
  -d '{"type":"diaper","details":{"kind":"wet"}}'
```

Log a feeding:

```bash
curl -s -X POST http://localhost:3000/babies/$BABY/events \
  -H 'Content-Type: application/json' \
  -d '{"type":"feeding","details":{"method":"bottle","amountMl":90}}'
```

Log a sleep:

```bash
curl -s -X POST http://localhost:3000/babies/$BABY/events \
  -H 'Content-Type: application/json' \
  -d '{"type":"sleep","details":{"startedAt":"2026-06-22T01:00:00Z","endedAt":"2026-06-22T03:30:00Z"}}'
```

List all events, then just feedings:

```bash
curl -s http://localhost:3000/babies/$BABY/events
curl -s "http://localhost:3000/babies/$BABY/events?type=feeding"
curl -s "http://localhost:3000/babies/$BABY/events?since=2026-06-22T00:00:00Z"
```

Get the last-24h summary:

```bash
curl -s http://localhost:3000/babies/$BABY/summary
```

A validation failure (unknown field) returns 422:

```bash
curl -s -X POST http://localhost:3000/babies \
  -H 'Content-Type: application/json' \
  -d '{"name":"Ada","birthdate":"2026-06-01","nickname":"A"}'
```

## Files

```
src/
  server.js   start the HTTP server
  app.js      express app: routes + response envelope
  schemas.js  zod validation schemas
  db.js       better-sqlite3 setup + table creation
```
