'use strict';

const router = require('express').Router();
const { getDb } = require('../db');
const { relayEvent } = require('../services/relay');
const logger = require('../logger');

router.all('/*', async (req, res) => {
  const db = getDb();
  const routePath = req.path || '/';
  const route = db.prepare('SELECT * FROM routes WHERE path = ?').get(routePath);

  if (!route) {
    return res.status(404).json({
      success: false,
      error: `Ruta '${routePath}' no encontrada. Créala con POST /api/routes`,
    });
  }

  const body = req.body && Object.keys(req.body).length > 0 ? JSON.stringify(req.body) : null;

  try {
    const result = await relayEvent(route.id, routePath, req.method, req.headers, body);
    res.json({
      success: true,
      data: {
        event_id: result.eventId,
        delivered: result.delivered,
        total_destinations: result.total,
        results: result.results,
      },
    });
  } catch (err) {
    logger.error('Webhook relay error', { path: routePath, error: err.message });
    res.status(500).json({ success: false, error: 'Error interno al procesar el webhook' });
  }
});

module.exports = router;
