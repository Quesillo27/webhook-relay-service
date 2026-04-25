'use strict';

const router = require('express').Router({ mergeParams: true });
const { getDb } = require('../db');
const { requireApiKey } = require('../middleware/auth');
const { validateDestinationCreateBody } = require('../middleware/validate');

// POST /api/routes/:id/destinations
router.post('/', requireApiKey, validateDestinationCreateBody, (req, res) => {
  const { url, headers } = req.body;
  const db = getDb();
  const route = db.prepare('SELECT id FROM routes WHERE id = ?').get(req.params.routeId);
  if (!route) return res.status(404).json({ success: false, error: 'Ruta no encontrada' });

  const row = db.prepare(`
    INSERT INTO destinations (route_id, url, headers) VALUES (?, ?, ?)
  `).run(route.id, url, JSON.stringify(headers || {}));

  res.status(201).json({
    success: true,
    data: { id: row.lastInsertRowid, route_id: route.id, url, headers: headers || {}, active: 1 },
  });
});

module.exports = router;
