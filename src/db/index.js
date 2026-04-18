'use strict';

const Database = require('better-sqlite3');
let _db;
let _dbPath;

function getDb() {
  const dbPath = process.env.DB_PATH || require('path').join(__dirname, '..', '..', 'relay.db');
  if (_db && _dbPath === dbPath) return _db;
  if (_db) { try { _db.close(); } catch { /* ignore */ } }
  _dbPath = dbPath;
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  migrate(_db);
  return _db;
}

function closeDb() {
  if (_db) { _db.close(); _db = null; }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS routes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      path        TEXT    NOT NULL UNIQUE,
      description TEXT,
      created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS destinations (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id   INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      url        TEXT    NOT NULL,
      headers    TEXT    NOT NULL DEFAULT '{}',
      active     INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id     INTEGER NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
      method       TEXT    NOT NULL,
      headers      TEXT    NOT NULL DEFAULT '{}',
      body         TEXT,
      received_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE TABLE IF NOT EXISTS deliveries (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id       INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      destination_id INTEGER NOT NULL REFERENCES destinations(id) ON DELETE CASCADE,
      attempt        INTEGER NOT NULL DEFAULT 1,
      status_code    INTEGER,
      success        INTEGER NOT NULL DEFAULT 0,
      error          TEXT,
      duration_ms    INTEGER,
      delivered_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_events_route     ON events(route_id);
    CREATE INDEX IF NOT EXISTS idx_events_received  ON events(received_at);
    CREATE INDEX IF NOT EXISTS idx_deliveries_event ON deliveries(event_id);
    CREATE INDEX IF NOT EXISTS idx_destinations_route ON destinations(route_id);
  `);
}

module.exports = { getDb, closeDb };
