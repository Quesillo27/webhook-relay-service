'use strict';

const { getDb } = require('./db');

const MAX_RETRIES    = parseInt(process.env.MAX_RETRIES    || '3');
const RETRY_DELAY_MS = parseInt(process.env.RETRY_DELAY_MS || '2000');
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '10000');

// ── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── Core relay logic ─────────────────────────────────────────────────────────

/**
 * Deliver a single event to a single destination with retries.
 */
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
    }

    const duration = Date.now() - startMs;

    db.prepare(`
      INSERT INTO deliveries (event_id, destination_id, attempt, status_code, success, error, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(event.id, destination.id, attempt, statusCode, success ? 1 : 0, error, duration);

    if (success) return { success: true, attempt, statusCode, duration };

    if (attempt < MAX_RETRIES) {
      await sleep(RETRY_DELAY_MS * attempt); // exponential backoff
    }
  }

  return { success: false, attempts: MAX_RETRIES };
}

/**
 * Fan-out: relay an incoming event to all active destinations of a route.
 */
async function relayEvent(routeId, routePath, method, headers, body) {
  const db = getDb();

  // Save event
  const eventRow = db.prepare(`
    INSERT INTO events (route_id, method, headers, body)
    VALUES (?, ?, ?, ?)
  `).run(routeId, method, JSON.stringify(headers), body);

  const eventId = eventRow.lastInsertRowid;

  // Get active destinations
  const destinations = db.prepare(`
    SELECT * FROM destinations WHERE route_id = ? AND active = 1
  `).all(routeId);

  if (destinations.length === 0) {
    return { eventId, delivered: 0, skipped: 0, results: [] };
  }

  // Deliver in parallel
  const event = { id: eventId, method, body, route_path: routePath };
  const results = await Promise.all(
    destinations.map(dest => deliverToDestination(event, dest).then(r => ({ dest_id: dest.id, url: dest.url, ...r })))
  );

  const ok = results.filter(r => r.success).length;

  return { eventId, delivered: ok, total: destinations.length, results };
}

function safeParseJSON(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

module.exports = { relayEvent };
