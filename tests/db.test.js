'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Unique DB per test file
const DB_FILE = path.join(os.tmpdir(), `relay_db_test_${Date.now()}.db`);
process.env.DB_PATH = DB_FILE;

const { getDb, closeDb } = require('../src/db');

test('getDb inicializa la base de datos sin errores', () => {
  const db = getDb();
  assert.ok(db, 'debe retornar instancia de DB');
});

test('Las 4 tablas existen después de la migración', () => {
  const db = getDb();
  const tables = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
  `).all().map(r => r.name);
  assert.ok(tables.includes('routes'), 'tabla routes');
  assert.ok(tables.includes('destinations'), 'tabla destinations');
  assert.ok(tables.includes('events'), 'tabla events');
  assert.ok(tables.includes('deliveries'), 'tabla deliveries');
});

test('Los índices existen', () => {
  const db = getDb();
  const indexes = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'
  `).all().map(r => r.name);
  assert.ok(indexes.includes('idx_events_route'), 'índice idx_events_route');
  assert.ok(indexes.includes('idx_deliveries_event'), 'índice idx_deliveries_event');
});

test('Crear y recuperar una ruta', () => {
  const db = getDb();
  const res = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Test Route', '/test-webhook');
  assert.ok(res.lastInsertRowid > 0, 'debe retornar ID');
  const route = db.prepare("SELECT * FROM routes WHERE path = ?").get('/test-webhook');
  assert.equal(route.name, 'Test Route');
  assert.equal(route.path, '/test-webhook');
});

test('Path único — insertar duplicado lanza error UNIQUE', () => {
  const db = getDb();
  db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Dupe', '/dupe-path');
  assert.throws(
    () => db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Dupe2', '/dupe-path'),
    /UNIQUE/
  );
});

test('Agregar destino y leerlo', () => {
  const db = getDb();
  const route = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Dest Test', '/dest-test');
  const res = db.prepare("INSERT INTO destinations (route_id, url, headers) VALUES (?, ?, ?)")
    .run(route.lastInsertRowid, 'https://example.com/wh', '{}');
  assert.ok(res.lastInsertRowid > 0);
  const dest = db.prepare("SELECT * FROM destinations WHERE id = ?").get(res.lastInsertRowid);
  assert.equal(dest.url, 'https://example.com/wh');
  assert.equal(dest.active, 1);
  assert.equal(dest.headers, '{}');
});

test('Registrar evento y delivery correctamente', () => {
  const db = getDb();
  const routeRow = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Ev Route', '/ev-route');
  const destRow = db.prepare("INSERT INTO destinations (route_id, url) VALUES (?, ?)").run(routeRow.lastInsertRowid, 'https://x.com');
  const evRow = db.prepare("INSERT INTO events (route_id, method, headers, body) VALUES (?, ?, ?, ?)")
    .run(routeRow.lastInsertRowid, 'POST', '{}', '{"hello":"world"}');
  const delRow = db.prepare("INSERT INTO deliveries (event_id, destination_id, attempt, status_code, success, duration_ms) VALUES (?, ?, 1, 200, 1, 50)")
    .run(evRow.lastInsertRowid, destRow.lastInsertRowid);
  assert.ok(delRow.lastInsertRowid > 0);
  const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(delRow.lastInsertRowid);
  assert.equal(delivery.success, 1);
  assert.equal(delivery.status_code, 200);
  assert.equal(delivery.duration_ms, 50);
});

test('Eliminar ruta elimina destinations y events en cascada', () => {
  const db = getDb();
  const r = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Cascade', '/cascade-del');
  const rId = r.lastInsertRowid;
  db.prepare("INSERT INTO destinations (route_id, url) VALUES (?, ?)").run(rId, 'https://del.com/x');
  db.prepare("INSERT INTO events (route_id, method, headers) VALUES (?, ?, ?)").run(rId, 'POST', '{}');
  db.prepare("DELETE FROM routes WHERE id = ?").run(rId);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM destinations WHERE route_id = ?").get(rId).c, 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM events WHERE route_id = ?").get(rId).c, 0);
});

test('Toggle activo/inactivo de destino', () => {
  const db = getDb();
  const r = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Toggle', '/toggle');
  const d = db.prepare("INSERT INTO destinations (route_id, url, active) VALUES (?, ?, 1)").run(r.lastInsertRowid, 'https://tog.com');
  const id = d.lastInsertRowid;
  db.prepare("UPDATE destinations SET active = 0 WHERE id = ?").run(id);
  assert.equal(db.prepare("SELECT active FROM destinations WHERE id = ?").get(id).active, 0);
  db.prepare("UPDATE destinations SET active = 1 WHERE id = ?").run(id);
  assert.equal(db.prepare("SELECT active FROM destinations WHERE id = ?").get(id).active, 1);
});

test('closeDb cierra la conexión correctamente', () => {
  const db = getDb();
  assert.ok(db.open, 'DB debe estar abierta');
  closeDb();
  assert.ok(!db.open, 'DB debe estar cerrada tras closeDb');
});

// cleanup
process.on('exit', () => { try { fs.unlinkSync(DB_FILE); } catch { /* ignore */ } });
