'use strict';

const Database = require('better-sqlite3');

// DB file is configurable so tests/dev can use a throwaway file; defaults to
// ./data.db relative to the process working directory.
const dbFile = process.env.DB_FILE || './data.db';

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables on startup if they don't already exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS babies (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    birthdate TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS events (
    id        TEXT PRIMARY KEY,
    babyId    TEXT NOT NULL,
    type      TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    details   TEXT NOT NULL,
    FOREIGN KEY (babyId) REFERENCES babies(id)
  );

  CREATE INDEX IF NOT EXISTS idx_events_baby_created
    ON events (babyId, createdAt);
`);

module.exports = db;
