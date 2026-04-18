'use strict';

const router = require('express').Router();
const { getDb } = require('../db');
const { requireApiKey } = require('../middleware/auth');

router.get('/', requireApiKey, (_req, res) => {
  const db = getDb();
  const since24h = Math.floor(Date.now() / 1000) - 86400;

  const routes      = db.prepare('SELECT COUNT(*) AS c FROM routes').get().c;
  const activeDests = db.prepare('SELECT COUNT(*) AS c FROM destinations WHERE active = 1').get().c;
  const totalDests  = db.prepare('SELECT COUNT(*) AS c FROM destinations').get().c;
  const events      = db.prepare('SELECT COUNT(*) AS c FROM events').get().c;
  const events24h   = db.prepare('SELECT COUNT(*) AS c FROM events WHERE received_at >= ?').get(since24h).c;
  const deliveries  = db.prepare('SELECT COUNT(*) AS c FROM deliveries').get().c;
  const success     = db.prepare('SELECT COUNT(*) AS c FROM deliveries WHERE success = 1').get().c;
  const failed      = db.prepare('SELECT COUNT(*) AS c FROM deliveries WHERE success = 0 AND attempt = (SELECT MAX(attempt) FROM deliveries d2 WHERE d2.event_id = deliveries.event_id AND d2.destination_id = deliveries.destination_id)').get().c;

  const perRoute = db.prepare(`
    SELECT r.id, r.name, r.path,
      COUNT(DISTINCT e.id) AS event_count,
      SUM(CASE WHEN d.success = 1 THEN 1 ELSE 0 END) AS delivered,
      SUM(CASE WHEN d.success = 0 THEN 1 ELSE 0 END) AS failed
    FROM routes r
    LEFT JOIN events e ON e.route_id = r.id
    LEFT JOIN deliveries d ON d.event_id = e.id
    GROUP BY r.id
    ORDER BY event_count DESC
  `).all();

  res.json({
    success: true,
    data: {
      routes,
      destinations: { active: activeDests, total: totalDests },
      events: { total: events, last_24h: events24h },
      deliveries: {
        total: deliveries,
        success,
        failed,
        success_rate: deliveries ? (success / deliveries * 100).toFixed(1) + '%' : 'N/A',
      },
      per_route: perRoute,
    },
  });
});

module.exports = router;
