'use strict';

const router = require('express').Router();
const { getDb } = require('../db');
const { requireApiKey } = require('../middleware/auth');
const { validateRouteBody } = require('../middleware/validate');

router.get('/', requireApiKey, (_req, res) => {
  const db = getDb();
  const routes = db.prepare('SELECT * FROM routes ORDER BY created_at DESC').all();
  const dests = db.prepare('SELECT * FROM destinations').all();
  const result = routes.map(r => ({
    ...r,
    destinations: dests.filter(d => d.route_id === r.id),
  }));
  res.json({ success: true, data: result });
});

router.get('/:id', requireApiKey, (req, res) => {
  const db = getDb();
  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id);
  if (!route) return res.status(404).json({ success: false, error: 'Ruta no encontrada' });
  const destinations = db.prepare('SELECT * FROM destinations WHERE route_id = ?').all(route.id);
  res.json({ success: true, data: { ...route, destinations } });
});

router.post('/', requireApiKey, validateRouteBody, (req, res) => {
  const { name, path: routePath, description } = req.body;
  const db = getDb();
  try {
    const row = db.prepare(`
      INSERT INTO routes (name, path, description) VALUES (?, ?, ?)
    `).run(name.trim(), routePath, description || null);
    res.status(201).json({
      success: true,
      data: { id: row.lastInsertRowid, name: name.trim(), path: routePath, description: description || null },
    });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, error: 'path ya existe' });
    }
    throw err;
  }
});

router.patch('/:id', requireApiKey, (req, res) => {
  const { name, description } = req.body;
  if (!name && description === undefined) {
    return res.status(400).json({ success: false, error: 'Se requiere al menos name o description' });
  }
  const db = getDb();
  const route = db.prepare('SELECT * FROM routes WHERE id = ?').get(req.params.id);
  if (!route) return res.status(404).json({ success: false, error: 'Ruta no encontrada' });

  const newName = (name && name.trim()) || route.name;
  const newDesc = description !== undefined ? description : route.description;
  db.prepare('UPDATE routes SET name = ?, description = ? WHERE id = ?').run(newName, newDesc, route.id);
  res.json({ success: true, data: { ...route, name: newName, description: newDesc } });
});

router.delete('/:id', requireApiKey, (req, res) => {
  const db = getDb();
  const result = db.prepare('DELETE FROM routes WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ success: false, error: 'Ruta no encontrada' });
  res.json({ success: true });
});

module.exports = router;
