'use strict';

const express = require('express');
const { getDb } = require('./src/db');
const { PORT, API_KEY, BODY_LIMIT } = require('./src/config');
const logger = require('./src/logger');

const routesRouter      = require('./src/routes/routes');
const destinationsRouter = require('./src/routes/destinations');
const destActionsRouter  = require('./src/routes/destinationActions');
const { routeEventsRouter, eventsRouter } = require('./src/routes/events');
const statsRouter        = require('./src/routes/stats');
const webhooksRouter     = require('./src/routes/webhooks');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', service: 'webhook-relay', ts: new Date().toISOString() });
});

app.use('/api/routes/:routeId/events', routeEventsRouter);
app.use('/api/routes/:routeId/destinations', destinationsRouter);
app.use('/api/routes', routesRouter);
app.use('/api/destinations', destActionsRouter);
app.use('/api/events', eventsRouter);
app.use('/api/stats', statsRouter);
app.use('/hooks', webhooksRouter);

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  logger.error('Unhandled error', { message: err.message });
  res.status(500).json({ success: false, error: 'Error interno del servidor' });
});

if (require.main === module) {
  getDb();
  app.listen(PORT, () => {
    logger.info('webhook-relay-service started', { port: PORT, auth: API_KEY ? 'enabled' : 'disabled' });
  });
}

module.exports = app;
