'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const supertest = require('supertest');

const DB_FILE = path.join(os.tmpdir(), `relay_api_test_${Date.now()}.db`);
process.env.DB_PATH = DB_FILE;
process.env.API_KEY = '';

const app = require('../server');
const request = supertest(app);

// ── Health ────────────────────────────────────────────────────────────────────

test('GET /health retorna status ok', async () => {
  const res = await request.get('/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'ok');
  assert.equal(res.body.success, true);
  assert.ok(res.body.ts);
});

// ── Routes CRUD ───────────────────────────────────────────────────────────────

test('POST /api/routes crea una ruta válida', async () => {
  const res = await request.post('/api/routes')
    .send({ name: 'Mi App', path: '/mi-app' });
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.id > 0);
  assert.equal(res.body.data.path, '/mi-app');
  assert.equal(res.body.data.name, 'Mi App');
});

test('POST /api/routes sin name retorna 400', async () => {
  const res = await request.post('/api/routes').send({ path: '/no-name' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
  assert.ok(res.body.error);
});

test('POST /api/routes sin path retorna 400', async () => {
  const res = await request.post('/api/routes').send({ name: 'Sin Path' });
  assert.equal(res.status, 400);
  assert.equal(res.body.success, false);
});

test('POST /api/routes path sin / inicial retorna 400', async () => {
  const res = await request.post('/api/routes').send({ name: 'Test', path: 'sin-slash' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /\/'/);
});

test('POST /api/routes path reservado /api retorna 400', async () => {
  const res = await request.post('/api/routes').send({ name: 'Reservado', path: '/api/algo' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /reservado/);
});

test('POST /api/routes path duplicado retorna 409', async () => {
  await request.post('/api/routes').send({ name: 'Dup', path: '/dup-route' });
  const res = await request.post('/api/routes').send({ name: 'Dup2', path: '/dup-route' });
  assert.equal(res.status, 409);
  assert.equal(res.body.success, false);
});

test('GET /api/routes retorna lista de rutas', async () => {
  const res = await request.get('/api/routes');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.data.length > 0);
});

test('GET /api/routes/:id retorna ruta individual con destinations', async () => {
  const created = await request.post('/api/routes').send({ name: 'GetById', path: '/get-by-id' });
  const id = created.body.data.id;
  const res = await request.get(`/api/routes/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, id);
  assert.ok(Array.isArray(res.body.data.destinations));
});

test('GET /api/routes/:id inexistente retorna 404', async () => {
  const res = await request.get('/api/routes/99999');
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
});

test('PATCH /api/routes/:id actualiza nombre y descripción', async () => {
  const created = await request.post('/api/routes').send({ name: 'Original', path: '/patch-route' });
  const id = created.body.data.id;
  const res = await request.patch(`/api/routes/${id}`).send({ name: 'Actualizado', description: 'Nueva desc' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.name, 'Actualizado');
  assert.equal(res.body.data.description, 'Nueva desc');
});

test('PATCH /api/routes/:id sin body retorna 400', async () => {
  const created = await request.post('/api/routes').send({ name: 'PatchEmpty', path: '/patch-empty' });
  const id = created.body.data.id;
  const res = await request.patch(`/api/routes/${id}`).send({});
  assert.equal(res.status, 400);
});

test('DELETE /api/routes/:id elimina la ruta', async () => {
  const created = await request.post('/api/routes').send({ name: 'ToDelete', path: '/to-delete-route' });
  const id = created.body.data.id;
  const res = await request.delete(`/api/routes/${id}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  const get = await request.get(`/api/routes/${id}`);
  assert.equal(get.status, 404);
});

test('DELETE /api/routes/:id inexistente retorna 404', async () => {
  const res = await request.delete('/api/routes/99999');
  assert.equal(res.status, 404);
});

// ── Destinations ──────────────────────────────────────────────────────────────

test('POST /api/routes/:id/destinations agrega destino válido', async () => {
  const route = await request.post('/api/routes').send({ name: 'DestRoute', path: '/dest-route' });
  const routeId = route.body.data.id;
  const res = await request.post(`/api/routes/${routeId}/destinations`)
    .send({ url: 'https://example.com/hook' });
  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.ok(res.body.data.id > 0);
  assert.equal(res.body.data.url, 'https://example.com/hook');
  assert.equal(res.body.data.active, 1);
});

test('POST /api/routes/:id/destinations sin url retorna 400', async () => {
  const route = await request.post('/api/routes').send({ name: 'NoUrl', path: '/no-url-dest' });
  const res = await request.post(`/api/routes/${route.body.data.id}/destinations`).send({});
  assert.equal(res.status, 400);
});

test('POST /api/routes/:id/destinations con url inválida retorna 400', async () => {
  const route = await request.post('/api/routes').send({ name: 'BadUrl', path: '/bad-url-dest' });
  const res = await request.post(`/api/routes/${route.body.data.id}/destinations`)
    .send({ url: 'not-a-url' });
  assert.equal(res.status, 400);
});

test('POST /api/routes/:id/destinations con file:// retorna 400', async () => {
  const route = await request.post('/api/routes').send({ name: 'FileProto', path: '/file-proto-dest' });
  const res = await request.post(`/api/routes/${route.body.data.id}/destinations`)
    .send({ url: 'file:///etc/passwd' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /http/);
});

test('POST destino a ruta inexistente retorna 404', async () => {
  const res = await request.post('/api/routes/99999/destinations').send({ url: 'https://x.com' });
  assert.equal(res.status, 404);
});

test('PATCH /api/destinations/:id/toggle cambia el estado activo', async () => {
  const route = await request.post('/api/routes').send({ name: 'Toggle', path: '/toggle-dest' });
  const dest = await request.post(`/api/routes/${route.body.data.id}/destinations`)
    .send({ url: 'https://toggle.example.com' });
  const destId = dest.body.data.id;
  const res = await request.patch(`/api/destinations/${destId}/toggle`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.active, false);
  const res2 = await request.patch(`/api/destinations/${destId}/toggle`);
  assert.equal(res2.body.data.active, true);
});

test('PATCH /api/destinations/:id actualiza url', async () => {
  const route = await request.post('/api/routes').send({ name: 'UpdDest', path: '/upd-dest' });
  const dest = await request.post(`/api/routes/${route.body.data.id}/destinations`)
    .send({ url: 'https://old.example.com' });
  const destId = dest.body.data.id;
  const res = await request.patch(`/api/destinations/${destId}`)
    .send({ url: 'https://new.example.com' });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.url, 'https://new.example.com');
});

test('PATCH /api/destinations/:id actualiza solo headers', async () => {
  const route = await request.post('/api/routes').send({ name: 'UpdHeaders', path: '/upd-headers' });
  const dest = await request.post(`/api/routes/${route.body.data.id}/destinations`)
    .send({ url: 'https://headers.example.com' });
  const destId = dest.body.data.id;
  const res = await request.patch(`/api/destinations/${destId}`)
    .send({ headers: { 'x-test-token': 'abc123' } });

  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data.headers, { 'x-test-token': 'abc123' });
  assert.equal(res.body.data.url, 'https://headers.example.com');
});

test('PATCH /api/destinations/:id con headers inválidos retorna 400', async () => {
  const route = await request.post('/api/routes').send({ name: 'BadHeaders', path: '/bad-headers' });
  const dest = await request.post(`/api/routes/${route.body.data.id}/destinations`)
    .send({ url: 'https://headers-invalid.example.com' });
  const destId = dest.body.data.id;
  const res = await request.patch(`/api/destinations/${destId}`)
    .send({ headers: ['no-valido'] });

  assert.equal(res.status, 400);
  assert.match(res.body.error, /headers/);
});

test('DELETE /api/destinations/:id elimina el destino', async () => {
  const route = await request.post('/api/routes').send({ name: 'DelDest', path: '/del-dest' });
  const dest = await request.post(`/api/routes/${route.body.data.id}/destinations`)
    .send({ url: 'https://del.example.com' });
  const destId = dest.body.data.id;
  const res = await request.delete(`/api/destinations/${destId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
});

test('DELETE /api/destinations/:id inexistente retorna 404', async () => {
  const res = await request.delete('/api/destinations/99999');
  assert.equal(res.status, 404);
});

// ── Stats ─────────────────────────────────────────────────────────────────────

test('GET /api/stats retorna estructura completa', async () => {
  const res = await request.get('/api/stats');
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(typeof res.body.data.routes === 'number');
  assert.ok(res.body.data.destinations);
  assert.ok(res.body.data.events);
  assert.ok(res.body.data.deliveries);
  assert.ok(Array.isArray(res.body.data.per_route));
});

// ── Webhooks ──────────────────────────────────────────────────────────────────

test('POST /hooks/inexistente retorna 404', async () => {
  const res = await request.post('/hooks/no-existe').send({ event: 'test' });
  assert.equal(res.status, 404);
  assert.equal(res.body.success, false);
  assert.match(res.body.error, /no encontrada/);
});

test('POST /hooks/<ruta> sin destinos retorna delivered:0', async () => {
  await request.post('/api/routes').send({ name: 'NoDestRoute', path: '/no-dest' });
  const res = await request.post('/hooks/no-dest').send({ payload: 'test' });
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.delivered, 0);
  assert.ok(res.body.data.event_id > 0);
});

// ── Events API ────────────────────────────────────────────────────────────────

test('GET /api/routes/:id/events retorna paginación', async () => {
  const route = await request.post('/api/routes').send({ name: 'EvRoute', path: '/ev-pag' });
  const routeId = route.body.data.id;
  await request.post('/hooks/ev-pag').send({ x: 1 });
  await request.post('/hooks/ev-pag').send({ x: 2 });
  const res = await request.get(`/api/routes/${routeId}/events?limit=10&offset=0`);
  assert.equal(res.status, 200);
  assert.equal(res.body.success, true);
  assert.ok(Array.isArray(res.body.data));
  assert.ok(res.body.pagination);
  assert.ok(typeof res.body.pagination.total === 'number');
});

test('GET /api/routes/:id/events de ruta inexistente retorna 404', async () => {
  const res = await request.get('/api/routes/99999/events');
  assert.equal(res.status, 404);
});

test('GET /api/events/:id retorna evento individual', async () => {
  const route = await request.post('/api/routes').send({ name: 'SingleEv', path: '/single-ev' });
  await request.post('/hooks/single-ev').send({ data: 'hello' });
  const eventsRes = await request.get(`/api/routes/${route.body.data.id}/events`);
  const eventId = eventsRes.body.data[0].id;
  const res = await request.get(`/api/events/${eventId}`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.id, eventId);
  assert.ok(Array.isArray(res.body.data.deliveries));
});

test('GET /api/events/:id inexistente retorna 404', async () => {
  const res = await request.get('/api/events/99999');
  assert.equal(res.status, 404);
});

// cleanup
process.on('exit', () => { try { fs.unlinkSync(DB_FILE); } catch { /* ignore */ } });
