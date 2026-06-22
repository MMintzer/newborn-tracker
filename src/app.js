'use strict';

const crypto = require('crypto');
const path = require('path');
const express = require('express');

const db = require('./db');
const { babyInput, eventInput, listQuery } = require('./schemas');

const DAY_MS = 24 * 60 * 60 * 1000;

// --- Response helpers --------------------------------------------------------

function sendData(res, data, status = 200) {
  res.status(status).json({ data, error: null });
}

function sendError(res, status, message, fields) {
  const error = { message };
  if (fields) error.fields = fields;
  res.status(status).json({ data: null, error });
}

// Turn a ZodError into a flat list of field-level errors.
function fieldErrors(zodError) {
  return zodError.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

// Rows store `details` as a JSON string; rehydrate it for responses.
function rowToEvent(row) {
  return { ...row, details: JSON.parse(row.details) };
}

// --- App ---------------------------------------------------------------------

const app = express();
app.use(express.json());

// Serve the static web UI (vanilla HTML/CSS/JS) from src/public.
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', (_req, res) => sendData(res, { status: 'ok' }));

// Create a baby profile.
app.post('/babies', (req, res) => {
  const parsed = babyInput.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'Validation failed', fieldErrors(parsed.error));
  }

  const baby = { id: crypto.randomUUID(), ...parsed.data };
  db.prepare('INSERT INTO babies (id, name, birthdate) VALUES (?, ?, ?)').run(
    baby.id,
    baby.name,
    baby.birthdate
  );
  return sendData(res, baby, 201);
});

// Log an event for a baby.
app.post('/babies/:id/events', (req, res) => {
  const baby = db.prepare('SELECT id FROM babies WHERE id = ?').get(req.params.id);
  if (!baby) return sendError(res, 404, 'Baby not found');

  const parsed = eventInput.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'Validation failed', fieldErrors(parsed.error));
  }

  const event = {
    id: crypto.randomUUID(),
    babyId: baby.id,
    type: parsed.data.type,
    createdAt: new Date().toISOString(),
    details: parsed.data.details,
  };
  db.prepare(
    'INSERT INTO events (id, babyId, type, createdAt, details) VALUES (?, ?, ?, ?, ?)'
  ).run(event.id, event.babyId, event.type, event.createdAt, JSON.stringify(event.details));

  return sendData(res, event, 201);
});

// List events, optionally filtered by ?type= and ?since=.
app.get('/babies/:id/events', (req, res) => {
  const baby = db.prepare('SELECT id FROM babies WHERE id = ?').get(req.params.id);
  if (!baby) return sendError(res, 404, 'Baby not found');

  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return sendError(res, 422, 'Validation failed', fieldErrors(parsed.error));
  }

  let sql = 'SELECT * FROM events WHERE babyId = ?';
  const args = [baby.id];
  if (parsed.data.type) {
    sql += ' AND type = ?';
    args.push(parsed.data.type);
  }
  if (parsed.data.since) {
    sql += ' AND createdAt >= ?';
    args.push(parsed.data.since);
  }
  sql += ' ORDER BY createdAt DESC';

  const events = db.prepare(sql).all(...args).map(rowToEvent);
  return sendData(res, events);
});

// Last-24h rollup for a baby.
app.get('/babies/:id/summary', (req, res) => {
  const baby = db.prepare('SELECT id FROM babies WHERE id = ?').get(req.params.id);
  if (!baby) return sendError(res, 404, 'Baby not found');

  const since = new Date(Date.now() - DAY_MS).toISOString();
  const events = db
    .prepare('SELECT type, details FROM events WHERE babyId = ? AND createdAt >= ?')
    .all(baby.id, since)
    .map(rowToEvent);

  const summary = {
    windowStart: since,
    feedCount: 0,
    totalSleepMinutes: 0,
    diaperCountByKind: { wet: 0, dirty: 0, both: 0 },
  };

  for (const event of events) {
    if (event.type === 'feeding') {
      summary.feedCount += 1;
    } else if (event.type === 'sleep') {
      const minutes =
        (new Date(event.details.endedAt) - new Date(event.details.startedAt)) / 60000;
      summary.totalSleepMinutes += minutes;
    } else if (event.type === 'diaper') {
      summary.diaperCountByKind[event.details.kind] += 1;
    }
  }
  summary.totalSleepMinutes = Math.round(summary.totalSleepMinutes);

  return sendData(res, summary);
});

// Malformed JSON bodies surface as SyntaxError from express.json().
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return sendError(res, 400, 'Request body is not valid JSON');
  }
  return sendError(res, 500, 'Internal server error');
});

module.exports = app;
