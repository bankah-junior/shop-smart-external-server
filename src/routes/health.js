'use strict';

const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

/**
 * GET /health
 * Returns server and DB status. No auth required (for load balancer checks).
 */
router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';

  return res.status(dbState === 1 ? 200 : 503).json({
    status: dbState === 1 ? 'ok' : 'degraded',
    service: 'ShopSmartExternalServer',
    database: dbStatus,
    timestamp: new Date().toISOString(),
    uptime_seconds: Math.floor(process.uptime()),
  });
});

module.exports = router;
