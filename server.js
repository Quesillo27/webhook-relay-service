'use strict';

const express = require('express');
const { getDb } = require('./db');
const { relayEvent } = require('./relay');

const PORT = parseInt(process.env.PORT || '4500');
const API_KEY = process.env.API_KEY || '';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Auth middleware (opcional) ────────────────────────────────────────────────
function requireApiKey(req, res, next) {
  if (!API_KEY) return next(); // sin API_KEY configurada → acceso libre
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== API_KEY) return res.status(401).json({ error: 'API key inválida' });
  next();
}

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'webhook-relay', ts: new Date().toISOString() });
});

// ── Routes API ────────────────────────────────────────────────────────────────

// Listar rutas
app.get('/api/routes', requireApiKey, (_req, res) => {
  const db = getDb();
  const routes = db.prepare('SELECT * FROM routes ORDER BY created_at DESC').all();
  const dests  = db.prepare('SELECT * FROM destinations').all();

  const result = routes.map(r => ({
    ...r,
    destinations: dests.filter(d => d.route_id === r.id),
  }));
  res.json(result);
});

// Crear ruta
app.post('/api/routes', requireApiKey, (req, res) => {
  const { name, path: routePath, description } = req.body;
  if (!name || !routePath) return res.status(400).json({ error: 'name y path son requeridos' });
  if (!routePath.startsWith('/')) return res.status(400).json({ error: "path debe comenzar con '/'" });
  if (routePath.startsWith('/api') || routePath === '/health') {
    return res.status(400).json({ error: 'path reservado' });
  }

  const db = getDb();
  try {
    const row = db.prepare(`
      INSERT INTO routes (name, path, description) VALUES (?, ?, ?)
    `).run(name, routePath, description || null);
    res.status(201).json({ id: row.lastInsertRowid, name, path: routePath, description });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'path ya existe' });
    throw err;
  }
});

// Eliminar ruta
app.delete('/api/routes/:id', requireApiKey, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM routes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Ruta no encontrada' });
  res.json({ ok: true });
});

// ── Destinations API ──────────────────────────────────────────────────────────

// Agregar destino a una ruta
app.post('/api/routes/:id/destinations', requireApiKey, (req, res) => {
  const { url, headers } = req.body;
  if (!url) return res.status(400).json({ error: 'url es requerida' });

  try { new URL(url); } catch { return res.status(400).json({ error: 'url inválida' }); }

  const db = getDb();
  const route = db.prepare('SELECT id FROM routes WHERE id = ?').get(req.params.id);
  if (!route) return res.status(404).json({ error: 'Ruta no encontrada' });

  const row = db.prepare(`
    INSERT INTO destinations (route_id, url, headers) VALUES (?, ?, ?)
  `).run(route.id, url, JSON.stringify(headers || {}));

  res.status(201).json({ id: row.lastInsertRowid, route_id: route.id, url, headers: headers || {} });
});

// Eliminar destino
app.delete('/api/destinations/:id', requireApiKey, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM destinations WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Destino no encontrado' });
  res.json({ ok: true });
});

// Toggle activo/inactivo
app.patch('/api/destinations/:id/toggle', requireApiKey, (req, res) => {
  const db = getDb();
  const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  if (!dest) return res.status(404).json({ error: 'Destino no encontrado' });
  db.prepare('UPDATE destinations SET active = ? WHERE id = ?').run(dest.active ? 0 : 1, dest.id);
  res.json({ id: dest.id, active: !dest.active });
});

// ── Events & Logs API ─────────────────────────────────────────────────────────

// Logs de eventos de una ruta (últimos 100)
app.get('/api/routes/:id/events', requireApiKey, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit || '50'), 200);
  const events = db.prepare(`
    SELECT e.*, GROUP_CONCAT(
      json_object('dest_id', d.destination_id, 'attempt', d.attempt, 'status', d.status_code, 'ok', d.success, 'ms', d.duration_ms)
    ) AS deliveries_raw
    FROM events e
    LEFT JOIN deliveries d ON d.event_id = e.id
    WHERE e.route_id = ?
    GROUP BY e.id
    ORDER BY e.received_at DESC
    LIMIT ?
  `).all(req.params.id, limit);

  const result = events.map(ev => ({
    ...ev,
    deliveries: ev.deliveries_raw
      ? ev.deliveries_raw.split(',{').map((s, i) => {
          try { return JSON.parse(i === 0 ? s : '{' + s); } catch { return null; }
        }).filter(Boolean)
      : [],
    deliveries_raw: undefined,
  }));

  res.json(result);
});

// Stats generales
app.get('/api/stats', requireApiKey, (_req, res) => {
  const db = getDb();
  const routes     = db.prepare('SELECT COUNT(*) AS c FROM routes').get().c;
  const dests      = db.prepare('SELECT COUNT(*) AS c FROM destinations WHERE active = 1').get().c;
  const events     = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  const deliveries = db.prepare('SELECT COUNT(*) AS c FROM deliveries').get().c;
  const success    = db.prepare('SELECT COUNT(*) AS c FROM deliveries WHERE success = 1').get().c;
  res.json({ routes, active_destinations: dests, events, deliveries, success_rate: deliveries ? (success / deliveries * 100).toFixed(1) + '%' : 'N/A' });
});

// ── Webhook receiver (catch-all) ──────────────────────────────────────────────
app.all('/hooks/*', async (req, res) => {
  const db = getDb();
  const routePath = req.path.replace('/hooks', '') || '/';
  const route = db.prepare('SELECT * FROM routes WHERE path = ?').get(routePath);

  if (!route) {
    return res.status(404).json({ error: `Ruta '${routePath}' no encontrada. Créala con POST /api/routes` });
  }

  const body = req.body ? JSON.stringify(req.body) : null;

  try {
    const result = await relayEvent(route.id, routePath, req.method, req.headers, body);
    res.json({
      ok: true,
      event_id: result.eventId,
      delivered: result.delivered,
      total_destinations: result.total || 0,
      results: result.results,
    });
  } catch (err) {
    console.error('[relay error]', err.message);
    res.status(500).json({ error: 'Error interno al procesar el webhook' });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
if (require.main === module) {
  getDb(); // inicializar DB al arrancar
  app.listen(PORT, () => {
    console.log(`🔁 webhook-relay-service corriendo en http://localhost:${PORT}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   API_KEY: ${API_KEY ? '****' + API_KEY.slice(-4) : '(no configurada — acceso libre)'}`);
  });
}

module.exports = app;
