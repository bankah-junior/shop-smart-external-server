'use strict';

/**
 * API Key authentication middleware.
 * Reads X-API-Key header and compares to env.API_KEY.
 * Rejects with 401 if missing or invalid.
 */

const logger = require('../utils/logger');

const apiKeyAuth = (req, res, next) => {
  const provided = req.headers['x-api-key'];
  if (!provided) {
    logger.warn('Auth: missing X-API-Key header', { ip: req.ip, path: req.path });
    return res.status(401).json({ success: false, message: 'Missing X-API-Key header' });
  }
  if (provided !== process.env.API_KEY) {
    logger.warn('Auth: invalid API key', { ip: req.ip, path: req.path });
    return res.status(401).json({ success: false, message: 'Invalid API key' });
  }
  next();
};

module.exports = apiKeyAuth;
