'use strict';

const logger = require('../utils/logger');

/**
 * Central error handler — always returns JSON.
 * Placed at the bottom of the Express middleware stack.
 */
// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  logger.error('Unhandled error', {
    status,
    message,
    stack: process.env.NODE_ENV !== 'production' ? err.stack : undefined,
    path: req.path,
    method: req.method,
  });

  res.status(status).json({
    success: false,
    message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

/**
 * 404 handler — catches routes that don't match.
 */
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
};

module.exports = { errorHandler, notFound };
