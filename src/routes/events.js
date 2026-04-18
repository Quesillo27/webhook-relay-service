'use strict';

const express = require('express');
const { getDb } = require('../db');
const { requireApiKey } = require('../middleware/auth');
const { retryEvent } = require('../services/relay');

function parseDeliveries(rows) {
  return rows.map(d => ({
    id: d.id,
    dest_id: d.destination_id,
    attempt: d.attempt,
    status_code: d.status_code,
    success: Boolean(d.success),
    error: d.error || null,
    duration_ms: d.duration_ms,
    delivered_at: d.delivered_at,
  }));
}

// Router mounted at /api/routes/:routeId/events
const routeEventsRouter = express.Router({ mergeParams: true });

routeEventsRouter.get('/', requireApiKey, (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit || '50'), 200);
  const offset = Math.max(parseInt(req.query.offset || '0'), 0);

  const route = db.prepare('SELECT id FROM routes WHERE id = ?').get(req.params.routeId);
  if (!route) return res.status(404).json({ success: false, error: 'Ruta no encontrada' });

  const total = db.prepare('SELECT COUNT(*) AS c FROM events WHERE route_id = ?').get(req.params.routeId).c;
  const events = db.prepare(`
    SELECT * FROM events WHERE route_id = ? ORDER BY received_at DESC LIMIT ? OFFSET ?
  `).all(req.params.routeId, limit, offset);

  const result = events.map(ev => {
    const deliveries = db.prepare('SELECT * FROM deliveries WHERE event_id = ? ORDER BY attempt ASC').all(ev.id);
    return { ...ev, deliveries: parseDeliveries(deliveries) };
  });

  res.json({ success: true, data: result, pagination: { total, limit, offset } });
});

// Router mounted at /api/events
const eventsRouter = express.Router();

eventsRouter.get('/:id', requireApiKey, (req, res) => {
  const db = getDb();
  const event = db.prepare('SELECT * FROM events WHERE id = ?').get(req.params.id);
  if (!event) return res.status(404).json({ success: false, error: 'Evento no encontrado' });
  const deliveries = db.prepare('SELECT * FROM deliveries WHERE event_id = ? ORDER BY attempt ASC').all(event.id);
  res.json({ success: true, data: { ...event, deliveries: parseDeliveries(deliveries) } });
});

eventsRouter.post('/:id/retry', requireApiKey, async (req, res) => {
  const result = await retryEvent(parseInt(req.params.id));
  if (!result) return res.status(404).json({ success: false, error: 'Evento no encontrado' });
  res.json({ success: true, data: result });
});

module.exports = { routeEventsRouter, eventsRouter };
