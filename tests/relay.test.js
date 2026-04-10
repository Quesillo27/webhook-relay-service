'use strict';

// Smoke tests — usa Node.js built-in test runner (node --test)
const { test } = require('node:test');
const assert   = require('node:assert/strict');
const path     = require('path');
const os       = require('os');

// Usar DB temporal para cada test
process.env.DB_PATH = path.join(os.tmpdir(), `relay_test_${Date.now()}.db`);
process.env.PORT = '0'; // no listen

const { getDb } = require('../db');

test('DB inicializa sin errores', () => {
  const db = getDb();
  assert.ok(db, 'db debe existir');
});

test('Crear y recuperar una ruta', () => {
  const db = getDb();
  const res = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Test Route', '/test-webhook');
  assert.ok(res.lastInsertRowid > 0, 'debe retornar un ID');

  const route = db.prepare("SELECT * FROM routes WHERE path = ?").get('/test-webhook');
  assert.equal(route.name, 'Test Route');
  assert.equal(route.path, '/test-webhook');
});

test('Agregar destino a una ruta', () => {
  const db = getDb();
  const route = db.prepare("SELECT id FROM routes LIMIT 1").get();
  assert.ok(route, 'debe existir al menos una ruta');

  const res = db.prepare("INSERT INTO destinations (route_id, url, headers) VALUES (?, ?, ?)")
    .run(route.id, 'https://example.com/webhook', '{}');
  assert.ok(res.lastInsertRowid > 0);

  const dest = db.prepare("SELECT * FROM destinations WHERE id = ?").get(res.lastInsertRowid);
  assert.equal(dest.url, 'https://example.com/webhook');
  assert.equal(dest.active, 1);
});

test('Registrar evento y delivery', () => {
  const db = getDb();
  const route = db.prepare("SELECT id FROM routes LIMIT 1").get();
  const dest  = db.prepare("SELECT id FROM destinations LIMIT 1").get();

  const evRow = db.prepare("INSERT INTO events (route_id, method, headers, body) VALUES (?, ?, ?, ?)")
    .run(route.id, 'POST', '{}', '{"hello":"world"}');
  assert.ok(evRow.lastInsertRowid > 0);

  const delRow = db.prepare("INSERT INTO deliveries (event_id, destination_id, attempt, status_code, success, duration_ms) VALUES (?, ?, 1, 200, 1, 50)")
    .run(evRow.lastInsertRowid, dest.id);
  assert.ok(delRow.lastInsertRowid > 0);

  const delivery = db.prepare("SELECT * FROM deliveries WHERE id = ?").get(delRow.lastInsertRowid);
  assert.equal(delivery.success, 1);
  assert.equal(delivery.status_code, 200);
});

test('Eliminar ruta elimina destinations y events en cascada', () => {
  const db = getDb();
  const res = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('To Delete', '/to-delete');
  const rId = res.lastInsertRowid;
  db.prepare("INSERT INTO destinations (route_id, url) VALUES (?, ?)").run(rId, 'https://example.com/x');
  db.prepare("INSERT INTO events (route_id, method, headers) VALUES (?, ?, ?)").run(rId, 'POST', '{}');

  db.prepare("DELETE FROM routes WHERE id = ?").run(rId);

  const dests  = db.prepare("SELECT COUNT(*) AS c FROM destinations WHERE route_id = ?").get(rId);
  const events = db.prepare("SELECT COUNT(*) AS c FROM events WHERE route_id = ?").get(rId);
  assert.equal(dests.c, 0, 'destinations deben eliminarse en cascada');
  assert.equal(events.c, 0, 'events deben eliminarse en cascada');
});

test('Stats query funciona correctamente', () => {
  const db = getDb();
  const stats = {
    routes:     db.prepare('SELECT COUNT(*) AS c FROM routes').get().c,
    dests:      db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c,
    events:     db.prepare('SELECT COUNT(*) AS c FROM events').get().c,
    deliveries: db.prepare('SELECT COUNT(*) AS c FROM deliveries').get().c,
  };
  // Solo verificar que las queries no fallan y retornan números
  assert.equal(typeof stats.routes, 'number');
  assert.equal(typeof stats.deliveries, 'number');
});

test('Toggle activo/inactivo de destino', () => {
  const db = getDb();
  const route = db.prepare("INSERT INTO routes (name, path) VALUES (?, ?)").run('Toggle Test', '/toggle-test');
  const dest  = db.prepare("INSERT INTO destinations (route_id, url, active) VALUES (?, ?, 1)").run(route.lastInsertRowid, 'https://example.com/toggle');
  const destId = dest.lastInsertRowid;

  // Toggle OFF
  db.prepare("UPDATE destinations SET active = ? WHERE id = ?").run(0, destId);
  let d = db.prepare("SELECT active FROM destinations WHERE id = ?").get(destId);
  assert.equal(d.active, 0, 'debe estar inactivo');

  // Toggle ON
  db.prepare("UPDATE destinations SET active = ? WHERE id = ?").run(1, destId);
  d = db.prepare("SELECT active FROM destinations WHERE id = ?").get(destId);
  assert.equal(d.active, 1, 'debe estar activo');
});
