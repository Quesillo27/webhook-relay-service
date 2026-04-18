'use strict';

const LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const active = LEVELS[LEVEL] ?? 1;

function log(level, message, data) {
  if ((LEVELS[level] ?? 0) < active) return;
  const entry = { ts: new Date().toISOString(), level, message };
  if (data !== undefined) entry.data = data;
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
  fn(JSON.stringify(entry));
}

module.exports = {
  debug: (msg, data) => log('debug', msg, data),
  info:  (msg, data) => log('info',  msg, data),
  warn:  (msg, data) => log('warn',  msg, data),
  error: (msg, data) => log('error', msg, data),
};
