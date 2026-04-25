'use strict';

const router = require('express').Router({ mergeParams: true });
const { getDb } = require('../db');
const { requireApiKey } = require('../middleware/auth');
const { validateDestinationUpdateBody } = require('../middleware/validate');

router.get('/:id', requireApiKey, (req, res) => {
  const db = getDb();
  const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  if (!dest) return res.status(404).json({ success: false, error: 'Destino no encontrado' });
  res.json({ success: true, data: { ...dest, headers: safeParseJSON(dest.headers) } });
});

router.patch('/:id', requireApiKey, validateDestinationUpdateBody, (req, res) => {
  const { url, headers } = req.body;
  const db = getDb();
  const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  if (!dest) return res.status(404).json({ success: false, error: 'Destino no encontrado' });

  const newUrl = url || dest.url;
  const newHeaders = headers !== undefined ? JSON.stringify(headers) : dest.headers;
  db.prepare('UPDATE destinations SET url = ?, headers = ? WHERE id = ?').run(newUrl, newHeaders, dest.id);
  res.json({ success: true, data: { id: dest.id, route_id: dest.route_id, url: newUrl, headers: safeParseJSON(newHeaders), active: dest.active } });
});

router.delete('/:id', requireApiKey, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM destinations WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, error: 'Destino no encontrado' });
  res.json({ success: true });
});

router.patch('/:id/toggle', requireApiKey, (req, res) => {
  const db = getDb();
  const dest = db.prepare('SELECT * FROM destinations WHERE id = ?').get(req.params.id);
  if (!dest) return res.status(404).json({ success: false, error: 'Destino no encontrado' });
  const newActive = dest.active ? 0 : 1;
  db.prepare('UPDATE destinations SET active = ? WHERE id = ?').run(newActive, dest.id);
  res.json({ success: true, data: { id: dest.id, active: Boolean(newActive) } });
});

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

module.exports = router;
