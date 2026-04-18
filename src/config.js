'use strict';

module.exports = {
  PORT: parseInt(process.env.PORT || '4500'),
  API_KEY: process.env.API_KEY || '',
  DB_PATH: process.env.DB_PATH || require('path').join(__dirname, '..', 'relay.db'),
  MAX_RETRIES: parseInt(process.env.MAX_RETRIES || '3'),
  RETRY_DELAY_MS: parseInt(process.env.RETRY_DELAY_MS || '2000'),
  REQUEST_TIMEOUT_MS: parseInt(process.env.REQUEST_TIMEOUT_MS || '10000'),
  BODY_LIMIT: process.env.BODY_LIMIT || '1mb',
};
