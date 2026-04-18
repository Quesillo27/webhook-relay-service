'use strict';

const { getDb } = require('../db');
const { MAX_RETRIES, RETRY_DELAY_MS, REQUEST_TIMEOUT_MS } = require('../config');
const logger = require('../logger');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

async function deliverToDestination(event, destination) {
  const db = getDb();
  const extraHeaders = safeParseJSON(destination.headers) || {};

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const startMs = Date.now();
    let statusCode = null;
    let success = false;
    let error = null;

    try {
      const res = await fetchWithTimeout(
        destination.url,
        {
          method: event.method === 'GET' ? 'POST' : event.method,
          headers: {
            'Content-Type': 'application/json',
            'X-Relay-Event-Id': String(event.id),
            'X-Relay-Attempt': String(attempt),
            'X-Relay-Source': event.route_path || 'unknown',
            ...extraHeaders,
          },
          body: event.body || undefined,
        },
        REQUEST_TIMEOUT_MS
      );
      statusCode = res.status;
      success = res.status >= 200 && res.status < 300;
    } catch (err) {
      error = err.message;
      logger.warn('Delivery attempt failed', { dest_id: destination.id, attempt, error });
    }

    const duration = Date.now() - startMs;

    db.prepare(`
      INSERT INTO deliveries (event_id, destination_id, attempt, status_code, success, error, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(event.id, destination.id, attempt, statusCode, success ? 1 : 0, error, duration);

    if (success) {
      logger.debug('Delivery successful', { dest_id: destination.id, attempt, status: statusCode, ms: duration });
      return { success: true, attempt, statusCode, duration };
    }

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }

  logger.warn('All delivery attempts failed', { dest_id: destination.id, attempts: MAX_RETRIES });
  return { success: false, attempts: MAX_RETRIES };
}

async function relayEvent(routeId, routePath, method, headers, body) {
  const db = getDb();

  const eventRow = db.prepare(`
    INSERT INTO events (route_id, method, headers, body) VALUES (?, ?, ?, ?)
  `).run(routeId, method, JSON.stringify(headers), body);

  const eventId = eventRow.lastInsertRowid;

  const destinations = db.prepare(`
    SELECT * FROM destinations WHERE route_id = ? AND active = 1
  `).all(routeId);

  if (destinations.length === 0) {
    return { eventId, delivered: 0, skipped: 0, total: 0, results: [] };
  }

  const event = { id: eventId, method, body, route_path: routePath };
  const results = await Promise.all(
    destinations.map(dest =>
      deliverToDestination(event, dest).then(r => ({ dest_id: dest.id, url: dest.url, ...r }))
    )
  );

  const delivered = results.filter(r => r.success).length;
  logger.info('Event relayed', { eventId, routePath, delivered, total: destinations.length });

  return { eventId, delivered, total: destinations.length, results };
}

async function retryEvent(eventId) {
  const db = getDb();

  const event = db.prepare(`
    SELECT e.*, r.path AS route_path FROM events e
    JOIN routes r ON r.id = e.route_id
    WHERE e.id = ?
  `).get(eventId);

  if (!event) return null;

  const destinations = db.prepare(`
    SELECT * FROM destinations WHERE route_id = ? AND active = 1
  `).all(event.route_id);

  if (destinations.length === 0) {
    return { eventId, delivered: 0, total: 0, results: [] };
  }

  const eventObj = { id: event.id, method: event.method, body: event.body, route_path: event.route_path };
  const results = await Promise.all(
    destinations.map(dest =>
      deliverToDestination(eventObj, dest).then(r => ({ dest_id: dest.id, url: dest.url, ...r }))
    )
  );

  const delivered = results.filter(r => r.success).length;
  return { eventId, delivered, total: destinations.length, results };
}

module.exports = { relayEvent, retryEvent };
