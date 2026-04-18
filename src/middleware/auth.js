'use strict';

const { API_KEY } = require('../config');

function requireApiKey(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== API_KEY) {
    return res.status(401).json({ success: false, error: 'API key inválida' });
  }
  next();
}

module.exports = { requireApiKey };
